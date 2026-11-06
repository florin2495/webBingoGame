-- Migration 004: prefix every Bingo object with "classicbingo_", so the Supabase project can host
-- several mini-games side by side (the future hub).
--
--   rooms -> classicbingo_rooms, players -> classicbingo_players, boards -> classicbingo_boards,
--   called_numbers -> classicbingo_called_numbers, marks -> classicbingo_marks
--
-- Constraints, indexes and the identity sequence are prefixed too: index and sequence names are
-- unique per schema, so another game's "players_room_idx" would otherwise collide (or be silently
-- skipped by "create index if not exists").
--
-- NOT backward compatible: the code deployed before v1.2.3 stops working the moment this commits.
-- Run it, then deploy v1.2.3 right away. Data, RLS, grants and foreign keys are kept as they are.
-- Safe to re-run: already renamed objects are skipped.

begin;

alter table if exists public.rooms          rename to classicbingo_rooms;
alter table if exists public.players        rename to classicbingo_players;
alter table if exists public.boards         rename to classicbingo_boards;
alter table if exists public.called_numbers rename to classicbingo_called_numbers;
alter table if exists public.marks          rename to classicbingo_marks;

do $$
declare
  r record;
begin
  -- Constraints (renaming a primary key / unique constraint also renames its index).
  for r in
    select c.conname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname in ('classicbingo_rooms', 'classicbingo_players', 'classicbingo_boards',
                        'classicbingo_called_numbers', 'classicbingo_marks')
      and c.conname not like 'classicbingo\_%'
  loop
    execute format('alter table public.%I rename constraint %I to %I', r.relname, r.conname, 'classicbingo_' || r.conname);
  end loop;

  -- Remaining indexes (the ones not backing a constraint).
  for r in
    select i.relname
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname in ('classicbingo_rooms', 'classicbingo_players', 'classicbingo_boards',
                        'classicbingo_called_numbers', 'classicbingo_marks')
      and i.relname not like 'classicbingo\_%'
  loop
    execute format('alter index public.%I rename to %I', r.relname, 'classicbingo_' || r.relname);
  end loop;

  -- Sequences owned by these tables (called_numbers.id identity).
  for r in
    select s.relname
    from pg_class s
    join pg_namespace n on n.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid
    where s.relkind = 'S'
      and n.nspname = 'public'
      and t.relname in ('classicbingo_rooms', 'classicbingo_players', 'classicbingo_boards',
                        'classicbingo_called_numbers', 'classicbingo_marks')
      and s.relname not like 'classicbingo\_%'
  loop
    execute format('alter sequence public.%I rename to %I', r.relname, 'classicbingo_' || r.relname);
  end loop;
end $$;

commit;

-- Let the Data API (PostgREST) see the new names immediately.
notify pgrst, 'reload schema';

-- Check: should list exactly the 5 classicbingo_ tables, all with rowsecurity = true.
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'classicbingo\_%' order by 1;
