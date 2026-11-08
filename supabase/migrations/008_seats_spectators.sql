-- Migration 008: host-chosen player order (seat) and spectators.
--  classicbingo_players.seat: play order in the lobby / for the round (lowest first calls first). The host reorders it
--                             with POST /reorder; new-round rotates it so the starter changes every round.
--  classicbingo_spectators:   people who joined a room that was already running. They see the public state only,
--                             can queue ("Intră la runda următoare") and become players at the next round.
-- Additive and idempotent. Run once in the Supabase SQL editor BEFORE deploying the code that reads it
-- (PLAYER_COLUMNS selects seat, so every players query fails until then).

alter table public.classicbingo_players add column if not exists seat integer not null default 0;
-- Backfill: join order per room (the old order). Only rows still at the default are touched.
update public.classicbingo_players p
   set seat = s.rn
  from (
    select id, row_number() over (partition by room_id order by joined_at) - 1 as rn
      from public.classicbingo_players
  ) s
 where p.id = s.id and p.seat = 0 and s.rn > 0;

create table if not exists public.classicbingo_spectators (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.classicbingo_rooms (id) on delete cascade,
  nickname     text not null check (char_length(nickname) between 1 and 20),
  token_hash   text not null unique,
  device_hash  text,
  queued_at    timestamptz,                                  -- set = wants to play next round (queue order)
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists classicbingo_spectators_room_nickname_uq on public.classicbingo_spectators (room_id, lower(nickname));
create index if not exists classicbingo_spectators_room_idx on public.classicbingo_spectators (room_id);

alter table public.classicbingo_spectators enable row level security;
revoke all on public.classicbingo_spectators from anon, authenticated;
