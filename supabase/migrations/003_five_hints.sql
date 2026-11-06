-- Migration 003: 5 "Show" hints per round instead of 3.
-- Run once in the Supabase SQL editor BEFORE deploying v1.2.2. Safe for the currently
-- deployed code (it never goes above 3).

alter table public.players drop constraint if exists players_hints_used_range;
alter table public.players drop constraint if exists players_hints_used_check;
alter table public.players
  add constraint players_hints_used_range check (hints_used between 0 and 5);
