-- Migration 007: "Show" hints depend on the grid size (5; 8x8: 15, 9x9: 20, 10x10: 25).
-- Raises the hints_used check from 0..5 to 0..25. Idempotent: the old checks are replaced only while the
-- new one is missing, so a second run changes nothing. No data is touched.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'classicbingo_players_hints_used_range'
      and conrelid = 'public.classicbingo_players'::regclass
      and pg_get_constraintdef(oid) like '%25%'
  ) then
    alter table public.classicbingo_players drop constraint if exists classicbingo_players_hints_used_range;
    alter table public.classicbingo_players drop constraint if exists players_hints_used_range;
    alter table public.classicbingo_players drop constraint if exists classicbingo_players_hints_used_check;
    alter table public.classicbingo_players
      add constraint classicbingo_players_hints_used_range check (hints_used between 0 and 25);
  end if;
end $$;
