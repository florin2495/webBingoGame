-- Migration 002: room inactivity expiry + per-round hints.
-- Run once in the Supabase SQL editor. Additive and backward compatible:
-- the currently deployed code ignores these columns, so it is safe to run before deploying.

alter table public.rooms
  add column if not exists last_activity_at timestamptz not null default now();

create index if not exists rooms_status_activity_idx
  on public.rooms (status, last_activity_at);

alter table public.players
  add column if not exists hints_used smallint not null default 0;

do $$ begin
  alter table public.players
    add constraint players_hints_used_range check (hints_used between 0 and 3);
exception when duplicate_object then null; end $$;
