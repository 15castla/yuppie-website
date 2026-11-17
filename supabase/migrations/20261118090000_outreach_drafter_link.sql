-- The Outreach Desk, Phase 2: the Outlook connection (Albert, 16 Nov 2026: "Ok fab, pls move onto stage 2"; plan
-- docs/plans/outreach-desk.md, sections 3 and 4). The drafter on Albert's Mac keeps all mail access (no new Microsoft
-- permission, no Entra change) and reports to the desk with its own key: the emails Albert sends, the replies,
-- bounces and automatic replies that answer them, and the follow-up drafts it makes in the thread. Nothing ever sends.
--
-- Adds: the drafter's key (only its SHA-256 fingerprint is stored; the key stays in the Mac's Keychain), the record of
-- each sync, the text of a follow-up (written by Albert now, by Alex in Phase 3) that the drafter turns into a draft,
-- the messages Albert chose to ignore in the review list, and a few columns on touches, outcomes and follow-ups.
-- Re-runnable on top of itself. Undo: release/undo-outreach-drafter-link.sql.

create table if not exists public.outreach_drafter_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Albert''s Mac',
  -- the SHA-256 of the key, as the drafter shows it ("desk-link"); a fingerprint can't be turned back into the key
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz
);
create unique index if not exists outreach_drafter_keys_one_active on public.outreach_drafter_keys ((true)) where revoked_at is null;
comment on table public.outreach_drafter_keys is 'Outreach Desk: the Mac drafter''s key, by fingerprint only. At most one active. Owner only.';

create table if not exists public.outreach_sync_runs (
  id uuid primary key default gen_random_uuid(),
  key_id uuid references public.outreach_drafter_keys (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default false,
  -- numbers only (messages read, sends found, replies, bounces, drafts made), never a name, an address or words
  counts jsonb not null default '{}'::jsonb,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists outreach_sync_runs_finished_idx on public.outreach_sync_runs (finished_at desc);

create table if not exists public.outreach_draft_texts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  followup_id uuid references public.outreach_followups (id) on delete cascade,
  outcome_id uuid references public.outreach_outcomes (id) on delete cascade,
  kind text not null default 'follow_up' check (kind in ('follow_up', 'january', 'reply')),
  -- only for an email that starts a new thread (a follow-up to a letter); one in the thread keeps "RE: ..."
  subject text,
  body text not null check (length(btrim(body)) between 1 and 20000),
  status text not null default 'written' check (status in ('written', 'drafted', 'discarded')),
  written_by text not null default 'albert' check (written_by in ('albert', 'assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_draft_texts_for check (followup_id is not null or outcome_id is not null)
);
create unique index if not exists outreach_draft_texts_followup on public.outreach_draft_texts (followup_id) where followup_id is not null;
create index if not exists outreach_draft_texts_target_idx on public.outreach_draft_texts (target_id);
comment on table public.outreach_draft_texts is 'Outreach Desk: the words of a follow-up (or, in Phase 3, a reply) that the drafter puts into an Outlook draft. Owner only.';

create table if not exists public.outreach_ignored_messages (
  internet_message_id text primary key,
  kind text not null default 'incoming' check (kind in ('incoming', 'sent')),
  ignored_at timestamptz not null default now()
);
comment on table public.outreach_ignored_messages is 'Outreach Desk: messages Albert ignored in the review list, by Outlook''s message id only, so the drafter never brings them back.';

-- touches: what Outlook says was attached (names and sizes, no content); for a send waiting in the review list, the
-- drafter's guess at what it was and the partners it could belong to
alter table public.outreach_touches add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.outreach_touches add column if not exists guess_kind text check (guess_kind in ('first', 'follow_up', 'resend', 'forward', 'conversation'));
alter table public.outreach_touches add column if not exists candidate_targets uuid[] not null default '{}';

-- outcomes: attachments; a hint for Albert ("possible opt-out", "calendar invitation"); the partners a probable match
-- could belong to (two partners on one domain)
alter table public.outreach_outcomes add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.outreach_outcomes add column if not exists hint text check (hint in ('possible_opt_out', 'invite'));
alter table public.outreach_outcomes add column if not exists candidate_targets uuid[] not null default '{}';

-- follow-ups: the Outlook draft the drafter made for it, and why the last try failed
alter table public.outreach_followups add column if not exists draft_id text;
alter table public.outreach_followups add column if not exists draft_link text;
alter table public.outreach_followups add column if not exists draft_made_at timestamptz;
alter table public.outreach_followups add column if not exists draft_error text;

do $$
declare t text;
begin
  drop trigger if exists outreach_draft_texts_updated_at on public.outreach_draft_texts;
  create trigger outreach_draft_texts_updated_at before update on public.outreach_draft_texts for each row execute function public.set_updated_at();
  foreach t in array array['outreach_drafter_keys', 'outreach_sync_runs', 'outreach_draft_texts', 'outreach_ignored_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
