-- The Outreach Desk, Phase 3: Alex (Albert, 17 Nov 2026: "do you want to do stage 3"; plan docs/plans/outreach-desk.md,
-- sections 0 and 9). Alex is Albert's own Claude account, reaching the desk through the Desk connector: a remote MCP
-- server at /api/desk/mcp, connected once by Albert (admin password and authenticator code). Alex can read the desk and
-- add notes, action points and the words of follow-ups and replies; it can't send, delete or change an opt-out.
--
-- Adds: Albert's approved guidance for each kind of email Alex writes (until he approves a kind, Alex writes none of
-- it); the connector's OAuth clients, one-off codes and grants (tokens stored only as SHA-256 hashes); the record of
-- each 06:30 email to Albert (numbers only); and the Outlook draft on a reply's words.
-- Re-runnable on top of itself. Undo: release/undo-desk-alex.sql.

create table if not exists public.outreach_guidance (
  kind text primary key check (kind in ('follow_up', 'january', 'reply')),
  -- how Alex should write this kind of email, in Albert's words
  instructions text not null check (length(btrim(instructions)) between 1 and 8000),
  -- an example in Albert's voice
  example text check (example is null or length(example) <= 8000),
  approved_at timestamptz,
  approved_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.outreach_guidance is 'Outreach Desk: Albert''s guidance for each kind of email Alex writes. Alex writes a kind only once it is approved. Owner only.';

create table if not exists public.desk_connector_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.desk_connector_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id text not null references public.desk_connector_clients (client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  owner_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.desk_connector_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.desk_connector_clients (client_id) on delete cascade,
  client_name text,
  owner_id uuid not null,
  access_hash text not null unique check (access_hash ~ '^[0-9a-f]{64}$'),
  access_expires_at timestamptz not null,
  refresh_hash text not null unique check (refresh_hash ~ '^[0-9a-f]{64}$'),
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists desk_connector_grants_open_idx on public.desk_connector_grants (revoked_at) where revoked_at is null;
comment on table public.desk_connector_grants is 'Outreach Desk: the Desk connector''s sign-ins (Albert''s Claude account). Tokens as SHA-256 hashes only. Owner only.';

create table if not exists public.desk_agenda_runs (
  day date primary key,
  sent_at timestamptz not null default now(),
  provider_id text,
  -- numbers only (follow-ups due, drafts ready, actions, calls, to check), never names or words
  counts jsonb not null default '{}'::jsonb
);

-- the Outlook draft made from a reply's words (the follow-ups keep theirs on outreach_followups)
alter table public.outreach_draft_texts add column if not exists draft_id text;
alter table public.outreach_draft_texts add column if not exists draft_link text;
alter table public.outreach_draft_texts add column if not exists draft_error text;
create unique index if not exists outreach_draft_texts_outcome on public.outreach_draft_texts (outcome_id) where outcome_id is not null;

do $$
declare t text;
begin
  foreach t in array array['outreach_guidance', 'desk_connector_clients', 'desk_connector_codes', 'desk_connector_grants', 'desk_agenda_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
