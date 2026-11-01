-- Undo the Concierge migration (20261101090000_concierge.sql). Deletes every Concierge conversation and memory.
-- Albert's say only. Run in the Supabase SQL editor, after the code is rolled back.
drop function if exists public.concierge_take_turn(uuid, text, integer, integer);
drop function if exists public.concierge_save_reply(uuid, uuid, text, jsonb, text, integer);
drop function if exists public.concierge_purge(uuid);
drop table if exists public.concierge_memory;
drop table if exists public.concierge_messages;
