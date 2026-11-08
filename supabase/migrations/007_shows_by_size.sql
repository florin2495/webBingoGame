-- Migration 007: "Show" hints depend on the grid size (5; 8x8: 15, 9x9: 20, 10x10: 25).
-- Raises the hints_used check from 0..5 to 0..25. Additive: the code that only knows 5 hints keeps working.
-- Run once in the Supabase SQL editor BEFORE deploying the code that reads it (an 8x8+ room would hit the
-- old check on its 6th hint). The constraint name is the one migration 004 gave it.
alter table public.classicbingo_players drop constraint if exists classicbingo_players_hints_used_range;
alter table public.classicbingo_players drop constraint if exists players_hints_used_range;
alter table public.classicbingo_players drop constraint if exists classicbingo_players_hints_used_check;
alter table public.classicbingo_players
  add constraint classicbingo_players_hints_used_range check (hints_used between 0 and 25);
