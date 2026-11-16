-- The Outreach Desk, Phase 1 (Albert, 15 and 16 Nov 2026; plan: docs/plans/outreach-desk.md, section 0). An
-- owner-only part of the admin that keeps one record of every communication with each partner: who they are, every
-- email, letter, call and meeting, every reply, bounce and out-of-office, notes, action points and follow-ups.
-- Re-runnable on top of itself. Undo: release/undo-outreach-desk.sql. The owner is set separately, once, by
-- release/set-desk-owner.sql.
--
-- Security: every outreach_ table has RLS on, no policies, and nothing granted to anon or authenticated, so only the
-- service role reads or writes them, inside server code that has already checked the owner (requireOwner()). An
-- admin who is not the owner (Kira) gets nothing through the REST API with her own session either.
--
-- Words: a target is the business we approach; a contact an address or a person there; a touch one thing we send
-- or do (an email, a letter, a call); a sequence one approach to a target (its first touch and every follow-up,
-- resend or forward after it; sequence_id is the first touch's id); an outcome something that comes back (a reply,
-- a bounce, an automatic reply).

-- 1. The owner flag -----------------------------------------------------------------------------------------
alter table public.admin_users add column if not exists is_owner boolean not null default false;
-- at most one owner
create unique index if not exists admin_users_one_owner on public.admin_users ((true)) where is_owner;
comment on column public.admin_users.is_owner is 'The owner (Albert): the only admin who can see the Outreach Desk. Set once by release/set-desk-owner.sql, never by the app.';

-- 2. Targets ------------------------------------------------------------------------------------------------
create table if not exists public.outreach_targets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  group_name text,
  category text not null default 'other' check (category in
    ('restaurant', 'bar', 'cafe', 'activities', 'cinema', 'grooming', 'hair_beauty', 'fitness', 'clothing', 'dry_cleaning', 'hotel', 'other')),
  domains text[] not null default '{}',
  website text,
  postal_address text,
  ask text not null default 'discount' check (ask in
    ('discount', 'extend_corporate_offer', 'extend_member_offer', 'featured_partner', 'meeting', 'events', 'other')),
  ask_detail text,
  ask_line text,
  exclusivity text not null default 'none' check (exclusivity in ('none', 'offered', 'agreed', 'declined')),
  exclusivity_category text,
  signed_by text not null default 'albert' check (signed_by in ('albert', 'kira')),
  stage text not null default 'not_started' check (stage in
    ('not_started', 'researching', 'ready', 'contacted', 'replied', 'call_booked', 'in_talks', 'agreed', 'live', 'declined', 'no_reply', 'paused')),
  stage_at timestamptz not null default now(),
  next_call_at timestamptz,
  next_action text,
  next_action_on date,
  hook text,
  avoid text,
  notes text,
  do_not_follow_up boolean not null default false,
  opted_out boolean not null default false,
  opted_out_at timestamptz,
  opted_out_note text,
  import_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_targets_stage_idx on public.outreach_targets (stage);
create index if not exists outreach_targets_category_idx on public.outreach_targets (category);
create index if not exists outreach_targets_domains_idx on public.outreach_targets using gin (domains);
comment on table public.outreach_targets is 'Outreach Desk: the businesses Club Yuppie approaches. Owner only (service role; RLS on, no policies).';

-- 3. Contacts -----------------------------------------------------------------------------------------------
create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  name text,
  role text,
  mailbox_type text not null default 'named_person' check (mailbox_type in ('named_person', 'founder', 'group_mailbox')),
  email text check (email is null or email = lower(email)),
  email_source text not null default 'unknown' check (email_source in
    ('rocketreach', 'apollo', 'published', 'albert', 'guessed', 'their_reply', 'unknown')),
  source_note text,
  email_status text not null default 'unknown' check (email_status in ('unknown', 'valid', 'bounced')),
  email_checked_at timestamptz,
  linkedin_url text,
  is_primary boolean not null default false,
  opted_out boolean not null default false,
  opted_out_at timestamptz,
  opted_out_note text,
  import_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_contacts_named check (name is not null or email is not null)
);
create index if not exists outreach_contacts_target_idx on public.outreach_contacts (target_id);
create index if not exists outreach_contacts_email_idx on public.outreach_contacts (email);
create unique index if not exists outreach_contacts_target_email on public.outreach_contacts (target_id, email) where email is not null;
comment on table public.outreach_contacts is 'Outreach Desk: people and addresses at a target. Professional, public information plus what they send us; no phone numbers. Owner only.';

-- 4. Touches (everything we send or do) ---------------------------------------------------------------------
create table if not exists public.outreach_touches (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  sequence_id uuid not null,
  channel text not null check (channel in ('email', 'letter', 'linkedin', 'call', 'whatsapp', 'in_person')),
  -- conversation: Albert's later messages in a live thread (not counted as outreach sent)
  kind text not null default 'first' check (kind in ('first', 'follow_up', 'resend', 'forward', 'conversation')),
  -- 0 the first touch, 1 the follow-up, 2 the January email; null for a conversation message
  step smallint check (step between 0 and 2),
  status text not null default 'sent' check (status in ('planned', 'queued', 'drafted', 'sent', 'posted', 'failed', 'cancelled', 'unconfirmed')),
  subject text,
  version text,
  attachment text,
  file_ref text,
  body_text text,
  body_html text,
  eml_sha256 text,
  sent_at timestamptz,
  letter_posted_on date,
  letter_class text check (letter_class in ('first', 'second', 'signed_for')),
  outlook_draft_id text,
  outlook_message_id text,
  internet_message_id text,
  conversation_id text,
  web_link text,
  counts_in_stats boolean not null default true,
  signed_by text check (signed_by in ('albert', 'kira')),
  created_by text not null default 'albert' check (created_by in ('albert', 'drafter', 'desk_chat', 'assistant', 'import')),
  note text,
  import_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_touches_target_idx on public.outreach_touches (target_id, sent_at desc);
create index if not exists outreach_touches_sequence_idx on public.outreach_touches (sequence_id);
create index if not exists outreach_touches_conversation_idx on public.outreach_touches (conversation_id);
create index if not exists outreach_touches_status_idx on public.outreach_touches (status);
create index if not exists outreach_touches_sent_idx on public.outreach_touches (sent_at desc);
create unique index if not exists outreach_touches_imid on public.outreach_touches (internet_message_id) where internet_message_id is not null;
create unique index if not exists outreach_touches_eml on public.outreach_touches (eml_sha256) where eml_sha256 is not null;
create unique index if not exists outreach_touches_draft on public.outreach_touches (outlook_draft_id) where outlook_draft_id is not null;
comment on table public.outreach_touches is 'Outreach Desk: every email, letter, LinkedIn message, call or meeting we send or do. Owner only.';

create table if not exists public.outreach_touch_recipients (
  id uuid primary key default gen_random_uuid(),
  touch_id uuid not null references public.outreach_touches (id) on delete cascade,
  contact_id uuid references public.outreach_contacts (id) on delete set null,
  -- a copy at send time; cleared when the person is deleted
  address text,
  role text not null default 'to' check (role in ('to', 'cc')),
  delivery text not null default 'unknown' check (delivery in ('unknown', 'delivered', 'bounced')),
  bounced_at timestamptz,
  bounce_code text
);
create index if not exists outreach_recipients_touch_idx on public.outreach_touch_recipients (touch_id);
create index if not exists outreach_recipients_address_idx on public.outreach_touch_recipients (address);
create index if not exists outreach_recipients_contact_idx on public.outreach_touch_recipients (contact_id);

-- 5. Outcomes (everything that comes back) ------------------------------------------------------------------
create table if not exists public.outreach_outcomes (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  sequence_id uuid,
  touch_id uuid references public.outreach_touches (id) on delete set null,
  contact_id uuid references public.outreach_contacts (id) on delete set null,
  kind text not null check (kind in ('reply', 'auto_reply', 'bounce', 'delay', 'opt_out_request')),
  channel text not null default 'email' check (channel in ('email', 'letter', 'phone', 'linkedin', 'whatsapp', 'in_person')),
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  received_at timestamptz not null,
  from_address text,
  from_name text,
  subject text,
  body_text text,
  body_html text,
  summary text,
  bounced_address text,
  bounce_code text,
  graph_message_id text,
  internet_message_id text,
  conversation_id text,
  web_link text,
  match_method text not null default 'manual' check (match_method in ('conversation', 'headers', 'sender', 'domain', 'manual')),
  confirmed boolean not null default true,
  is_first_reply boolean not null default false,
  reply_seconds integer,
  created_by text not null default 'albert' check (created_by in ('albert', 'drafter', 'assistant', 'import')),
  import_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists outreach_outcomes_target_idx on public.outreach_outcomes (target_id, received_at desc);
create index if not exists outreach_outcomes_sequence_idx on public.outreach_outcomes (sequence_id);
create index if not exists outreach_outcomes_review_idx on public.outreach_outcomes (confirmed) where not confirmed;
create unique index if not exists outreach_outcomes_imid on public.outreach_outcomes (internet_message_id) where internet_message_id is not null;
comment on table public.outreach_outcomes is 'Outreach Desk: replies, bounces, automatic replies and requests to stop, in full. Owner only.';

-- 6. Stage history, follow-ups, notes and action points ------------------------------------------------------
create table if not exists public.outreach_stage_history (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  at timestamptz not null default now(),
  by text not null default 'albert' check (by in ('albert', 'drafter', 'assistant', 'import')),
  note text
);
create index if not exists outreach_stage_history_target_idx on public.outreach_stage_history (target_id, at desc);

-- One follow-up 7 working days after the first email went out (10 after a posted letter), then the January email
-- (Albert, 16 Nov 2026). The effective due date is the later of due_on and snoozed_until.
create table if not exists public.outreach_followups (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  sequence_id uuid not null,
  step smallint not null check (step in (1, 2)),
  channel text not null default 'email' check (channel in ('email', 'letter')),
  due_on date not null,
  snoozed_until date,
  status text not null default 'scheduled' check (status in ('scheduled', 'drafted', 'done', 'skipped', 'paused', 'cancelled')),
  reason text check (reason in ('replied', 'bounced', 'opted_out', 'no_email', 'manual', 'superseded')),
  touch_id uuid references public.outreach_touches (id) on delete set null,
  stale_draft boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, step)
);
create index if not exists outreach_followups_due_idx on public.outreach_followups (status, due_on);
create index if not exists outreach_followups_target_idx on public.outreach_followups (target_id);

create table if not exists public.outreach_notes (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  kind text not null default 'note' check (kind in ('meeting', 'call', 'note', 'whatsapp')),
  happened_at timestamptz not null default now(),
  title text,
  body text not null check (length(btrim(body)) > 0),
  source text not null default 'albert' check (source in ('albert', 'assistant', 'import')),
  import_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_notes_target_idx on public.outreach_notes (target_id, happened_at desc);

create table if not exists public.outreach_actions (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.outreach_targets (id) on delete cascade,
  kind text not null default 'task' check (kind in ('call', 'meeting', 'task', 'reply_due')),
  title text not null check (length(btrim(title)) between 1 and 300),
  due_on date,
  starts_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  source text not null default 'albert' check (source in ('albert', 'assistant', 'drafter', 'import')),
  note_id uuid references public.outreach_notes (id) on delete set null,
  import_key text unique,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists outreach_actions_open_idx on public.outreach_actions (status, due_on);
create index if not exists outreach_actions_target_idx on public.outreach_actions (target_id);

-- 7. updated_at, RLS and grants ------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['outreach_targets', 'outreach_contacts', 'outreach_touches', 'outreach_followups', 'outreach_notes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
  foreach t in array array['outreach_targets', 'outreach_contacts', 'outreach_touches', 'outreach_touch_recipients', 'outreach_outcomes',
                           'outreach_stage_history', 'outreach_followups', 'outreach_notes', 'outreach_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
