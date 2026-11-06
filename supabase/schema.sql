-- Bingo multiplayer (ClassicBingo) - Supabase schema
-- Every object is prefixed with classicbingo_ because the Supabase project is shared by several
-- mini-games (the hub). Keep the prefix on anything new: tables, constraints, indexes.
-- Run this whole file once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent for a fresh project; re-running on an existing project drops nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- classicbingo_rooms: one row per game room. N (size) and the win condition live here.
-- ---------------------------------------------------------------------------
create table if not exists public.classicbingo_rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name             text not null check (char_length(name) between 1 and 40),
  password_hash    text,                                   -- scrypt hash, null = no password
  size             smallint not null default 7 check (size between 3 and 10),
  lines_to_win     smallint not null default 1 check (lines_to_win between 1 and 3),
  status           text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  round            integer not null default 1 check (round >= 1),
  turn_order       uuid[] not null default '{}',           -- fixed at game start
  turn_offset      integer not null default 0,             -- incremented when the host skips a turn
  host_player_id   uuid,
  winner_player_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()      -- lobby/finished rooms idle > 60 min are deleted
);
create index if not exists classicbingo_rooms_status_activity_idx on public.classicbingo_rooms (status, last_activity_at);

-- ---------------------------------------------------------------------------
-- classicbingo_players: members of a room. Identity = random token kept by the browser,
-- only its SHA-256 hash is stored. "ready" is per player, reset every round.
-- ---------------------------------------------------------------------------
create table if not exists public.classicbingo_players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.classicbingo_rooms (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 20),
  token_hash text not null unique,
  is_host    boolean not null default false,
  ready      boolean not null default false,
  hints_used smallint not null default 0                                 -- reset every round
             constraint classicbingo_players_hints_used_range check (hints_used between 0 and 5),
  joined_at  timestamptz not null default now()
);
create unique index if not exists classicbingo_players_room_nickname_uq on public.classicbingo_players (room_id, lower(nickname));
create index if not exists classicbingo_players_room_idx on public.classicbingo_players (room_id);

do $$ begin
  alter table public.classicbingo_rooms
    add constraint classicbingo_rooms_host_fk foreign key (host_player_id) references public.classicbingo_players (id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.classicbingo_rooms
    add constraint classicbingo_rooms_winner_fk foreign key (winner_player_id) references public.classicbingo_players (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- classicbingo_boards: one N x N board per player per round, stored row-major.
-- Content (exactly 1..N*N once each) is validated in the Route Handlers.
-- ---------------------------------------------------------------------------
create table if not exists public.classicbingo_boards (
  player_id  uuid not null references public.classicbingo_players (id) on delete cascade,
  room_id    uuid not null references public.classicbingo_rooms (id) on delete cascade,
  round      integer not null,
  cells      smallint[] not null check (cardinality(cells) between 9 and 100),
  updated_at timestamptz not null default now(),
  primary key (player_id, round)
);
create index if not exists classicbingo_boards_room_round_idx on public.classicbingo_boards (room_id, round);

-- ---------------------------------------------------------------------------
-- classicbingo_called_numbers: the ordered list of numbers called in a round.
-- The two unique constraints make "call" race-safe without locks:
--   * a number can be called only once per round
--   * each sequence slot (= whose turn it was) can be filled only once
-- ---------------------------------------------------------------------------
create table if not exists public.classicbingo_called_numbers (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.classicbingo_rooms (id) on delete cascade,
  round      integer not null,
  seq        integer not null check (seq >= 1),
  number     smallint not null check (number between 1 and 100),
  player_id  uuid references public.classicbingo_players (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (room_id, round, number),
  unique (room_id, round, seq)
);

-- ---------------------------------------------------------------------------
-- classicbingo_marks: manual ticks a player puts on their own board (by number).
-- Marks may be wrong on purpose or by mistake; validation checks them.
-- ---------------------------------------------------------------------------
create table if not exists public.classicbingo_marks (
  player_id  uuid not null references public.classicbingo_players (id) on delete cascade,
  room_id    uuid not null references public.classicbingo_rooms (id) on delete cascade,
  round      integer not null,
  number     smallint not null check (number between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (player_id, round, number)
);

-- ---------------------------------------------------------------------------
-- Security: RLS on, NO policies -> anon / authenticated roles can read or
-- write nothing. Only the service role (used by the Next.js Route Handlers,
-- which bypasses RLS) touches these tables.
-- ---------------------------------------------------------------------------
alter table public.classicbingo_rooms          enable row level security;
alter table public.classicbingo_players        enable row level security;
alter table public.classicbingo_boards         enable row level security;
alter table public.classicbingo_called_numbers enable row level security;
alter table public.classicbingo_marks          enable row level security;

revoke all on public.classicbingo_rooms, public.classicbingo_players, public.classicbingo_boards, public.classicbingo_called_numbers, public.classicbingo_marks
  from anon, authenticated;
