-- Migration 005: pending kick. A host's kick during a running game starts a 10 s countdown
-- (kick_requested_at = when it was requested); the player can press "Ignoră" to stay.
-- null = no pending kick. Additive and backward compatible with the deployed code.
-- Run once in the Supabase SQL editor BEFORE deploying the code that reads the column.

alter table public.classicbingo_players add column if not exists kick_requested_at timestamptz;
