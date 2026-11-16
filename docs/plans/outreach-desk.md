# Outreach Desk: the plan

A plan for Albert to approve. Nothing in it is built. Written 15 Nov 2026 on branch `plan/outreach-desk`, from main
at 155e3e1; every question answered by Albert on 15 and 16 Nov (section 0).

Contents: 0 Where the plan landed · 1 Summary · 2 Data model · 3 Capture · 4 Follow-ups · 5 Screens · 6 Analytics definitions · 7 The copy
from Outreach_Log · 8 Security and privacy · 9 Phased build · 10 Risks and open questions

---

## 0. Where the plan landed (Albert, 15 and 16 Nov)

All 33 questions in section 10 are answered. Where an older passage below disagrees, this section wins.

**What it is.** An owner-only section of the admin, run by an executive assistant called **Alex**. Alex keeps one
record of every communication with each partner (emails in full, both ways; letters; calls; meetings and their notes;
WhatsApp later), logs every action point, writes replies and follow-ups as Outlook drafts in Albert's voice, and
emails Albert his day at 06:30. Nothing is ever sent to a partner: Albert sends.

| Topic | Decision |
|---|---|
| Access | Owner only. Anyone else sees "You don't have access to this page." and no Desk link |
| Follow-ups | One follow-up email, 7 working days after the first email actually went out, or 10 working days after a letter was posted, carrying the same attachment. Then nothing until the **January round**: a third email to everyone without a reply, across the week of Mon 11 Jan 2027, a few each morning |
| Working days | Monday to Friday, skipping England and Wales bank holidays and 21 Dec to 1 Jan |
| When drafts appear | Written the night before they're due, so Albert reviews them that morning |
| Who writes | Alex, which is Albert's own Claude account (not the Anthropic account Concierge uses), through the Desk connector. A nightly scheduled task in his account (about 21:30) writes tomorrow's follow-ups, January emails and replies to partners' replies; the drafter then makes them Outlook drafts in the thread at its next check. Albert approves Alex's guidance for each kind of email once the flow is built; until then no drafts of that kind |
| Desk connector | One secure door between Albert's Claude account and the desk, connected once with his admin password and authenticator code. It can read the desk and add notes, actions and draft text; it can't send, delete or change an opt-out. Revocable from the desk |
| Assistant chat | A dedicated "Alex" chat in Albert's Claude account with the connector. He sends photos of meeting notes or types things up; Alex sorts them onto the partner's page with their action points, and briefs him on any partner |
| Morning email | 06:30 every day, from "Alex at Yuppie" <alex@clubyuppie.com> to albert@clubyuppie.com only (the code allows no other recipient), sent by the website's existing email service. The whole agenda is in the email, with a link to the desk's Today page at the bottom. alex@ becomes a free alias in Microsoft 365 so a reply reaches Albert |
| Outlook | The drafter on the Mac keeps all mail access: no new Microsoft permission, no Entra change. It checks every 15 minutes while the Mac is awake, reads everything since 1 Nov the first time, and links to the desk with its own key (made on the Mac, kept in the Keychain; only its fingerprint goes into the desk; re-linked every six months). After a reply, an unedited follow-up draft moves to Deleted Items. Moving mail access to the website is for later, with WhatsApp |
| Records | The full text of every email both ways; attachments stay in Outlook, with their names and a link. No phone numbers for now (WhatsApp will need them). Unrecorded address sources count as "supplied by Albert". Deleting someone who opted out is done by hand. Categories as listed in 10.12, Padium as fitness. Kira has no view |
| Outreach_Log | Stops being updated once the desk is live; the desk is the record |

**Build phases** (detail in section 9)

1. **Records and partner pages:** the copy from the log, partner pages with everything on them, the blotter, manual
   logging of emails, letters, calls, meetings, notes and actions, Due today, the Today page, the no-access page.
2. **Outlook:** the drafter reads sends, replies, bounces, out-of-office replies and invitations in full, backfills
   from 1 Nov, and turns draft text saved in the desk into in-thread drafts with the attachment.
3. **Alex:** the Desk connector, the assistant chat, the nightly writer and the 06:30 email.
4. **Charts and breakdowns.**

WhatsApp comes another day.

### 0.1 Data added by these decisions

- **Phase 1:** `outreach_notes` (id, target_id, kind `meeting, call, note, whatsapp`, happened_at, title, body,
  source `albert, assistant`, created_at; a photo of notes stays in the chat, its transcription comes to the desk) and
  `outreach_actions` (id, target_id, kind `call, meeting, task, reply_due`, title, due_on or starts_at, status `open,
  done, cancelled`, source `albert, assistant, drafter`, note_id, created_at, done_at). Follow-ups stay in
  `outreach_followups`; the Today page and the 06:30 email combine both.
- **Phase 2:** touches and outcomes gain `body_html`, `body_text` and `attachments` (names, sizes, Outlook link); the
  `preview` column goes.
- **Phase 3:** `outreach_draft_texts` (id, target_id, followup_id or outcome_id, kind `follow_up, january, reply`,
  subject, html, written_at, status `written, drafted, discarded`, draft_touch_id); `outreach_guidance` (per kind,
  Albert's approved instructions and example wording for Alex; replaces `outreach_templates`); `desk_connector_grants`
  (the connector's OAuth clients and hashed tokens, created_at, last_used_at, revoked_at); `desk_agenda_runs` (date,
  sent_at, counts and the email service's id, no content). Migration `20261201090000_desk_alex.sql` with its undo
  file.
- Deleting a person also clears the text of their emails and notes about them.

---

## 1. Summary

Club Yuppie's partner outreach (emails, printed letters, and later LinkedIn messages and calls) is recorded today in a
Markdown table. It is hard to analyse and nothing says when a follow-up is due. The Outreach Desk is an owner-only
section of the existing admin console at `/admin/desk`. It keeps one record of every target, person, message, letter,
reply, bounce and out-of-office. It schedules follow-ups by working days and has the Outlook drafter put each one into
Outlook as a draft in the same thread, on the day it is due. Nothing ever sends: Albert sends. A dense, numeric,
dark trading-screen view shows the numbers that matter (sent this week, response rate, positive rate, calls booked,
partners live, follow-ups due), a blotter of every touch, and charts that always show their sample size, because the
numbers are small. It reuses the admin login, MFA and audit trail, adds an owner flag so Kira and other admins cannot
see it, and needs no new Microsoft permission and no change to the Entra app.

What the investigation found (this shapes everything below):

- **Admin.** `admin_users` holds only `id` and `created_at` (RLS on, no policies, so only the service role reads it).
  `requireAdmin()` (cached per request) sends a signed-out visitor to `/admin/login`, a non-admin to `/`, and anyone
  without aal2 (password plus authenticator code) back to `/admin/login`. Every admin page reads through the service
  role. `admin_audit` (admin_id, action, target_type, target_id, details jsonb, created_at) is written by
  `audit()` in `lib/server/audit.ts`, which never throws. No admin screen lists audit rows in general; two pages read
  one specific action each.
- **Nav.** `components/admin/admin-bar.tsx` has a fixed `NAV` list (Dashboard to Payments). The protected layout
  passes it the signed-in email and queue counts.
- **Jobs.** Vercel Hobby allows one cron run a day, so Supabase pg_cron calls `GET /api/cron/<job>` with
  `Authorization: Bearer CRON_SECRET` (secret in Vault), as `release/schedule-cron.sql` sets up.
- **Charts.** The repo has no chart library (package.json: Next 16.3.1, React 19.2.8, Stripe, Supabase,
  framer-motion, lucide-react). The only SVG in admin is the icon set.
- **Tests.** Node scripts in `tests/e2e/phase-b/` run against the local stack and a production build, and each
  admin suite checks refusals (no session, aal1 admin, member) on every page, RSC request and action. The drafter has
  Python unit tests with a stand-in Microsoft (`FakeMicrosoft`).
- **Drafter.** `tools/outlook-drafter/draft_partner_emails.py` (Python 3.9+, standard library only) asks for
  delegated `Mail.ReadWrite`, `User.Read` and `offline_access`, and refuses any token carrying `Mail.Send`
  (`FORBIDDEN_SCOPES`). Its refresh token is in the Keychain (service `club-yuppie-drafts`). It finds
  `"... - ready to send.eml"` files without a `.drafted` marker in OneDrive `Partner emails/<Brand>/` and
  `Emails to draft/`, creates the draft with `POST /me/messages`, stamps it with a hidden property
  (`ClubYuppieDraftKey` = the .eml's SHA-256) and writes the marker JSON beside the file (`draftedAt`, `mailbox`,
  `draftId`, `openInOutlook`, `subject`, `to`, `emlSha256`, `alreadyThere`; `skip` writes `skippedAt`, `skipped`,
  `reason`). The launcher runs the script in place from the repo, so a sibling module would load without changing
  `install.sh`.
- **Permission.** `Mail.ReadWrite` lets the drafter read, create, update and delete mail in Albert's mailbox (Sent
  Items, Inbox, Junk included). It does not allow sending. Everything in this plan fits inside it (section 3.8).

---

## 2. Data model

### 2.1 Conventions

- One migration per phase in `supabase/migrations/`, each with an undo file in `release/`, ending with
  `notify pgrst, 'reload schema';` (the host-money release showed a stale schema cache without it).
- Enumerations are `text` with a `check` constraint, as `plan_payments.status` is, so a new value is a one-line
  migration.
- `uuid` ids (`gen_random_uuid()`), `timestamptz` times. Dates and weeks are UK dates (`Europe/London`). Email
  addresses are stored lower-case (`check (email = lower(email))`).
- Every table is prefixed `outreach_`.

### 2.2 The owner flag

```
alter table public.admin_users add column is_owner boolean not null default false;
create unique index admin_users_one_owner on public.admin_users ((true)) where is_owner;   -- at most one owner
```

The flag is set once by a separate statement (`release/set-desk-owner.sql`, run through Claude Code's Supabase MCP or
the SQL editor with Albert approving): `update admin_users set is_owner = true where id = (select id from auth.users
where email = 'albert@clubyuppie.com')`. No screen and no action can change it, so an admin can never make
themselves the owner from the app.

### 2.3 Words used below

- **Target:** the business we approach (a brand, venue or group), for example "Hakkasan Mayfair".
- **Contact:** an address or a person at a target: a named person, a founder, or a group mailbox.
- **Touch:** one thing we send or do: an email, a letter, a LinkedIn message, a call.
- **Sequence:** one approach to one target: its first touch and every follow-up, resend or forward after it, until
  it closes. Rates count sequences, so a target is counted once however many follow-ups it took.
- **Outcome:** something that comes back: a reply, a bounce, an out-of-office or other automatic reply, a delay
  notice, a request to stop.

### 2.4 Tables (Phase 1 unless marked)

**`outreach_targets`**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| name | text not null | as Albert says it: "Flight Club and Electric Shuffle" |
| group_name | text | owner company: "Red Engine", "Hakkasan Group" |
| category | text not null | `restaurant, bar, cafe, activities, cinema, grooming, hair_beauty, fitness, clothing, dry_cleaning, hotel, other` (question 10.12) |
| domains | text[] not null default '{}' | lower-case, for matching replies: `{hakkasangroup.com, hakkasan.com}` |
| website | text | |
| postal_address | text | professional only (business or registered office); needed for a letter step |
| ask | text not null | `discount, extend_corporate_offer, extend_member_offer, featured_partner, meeting, events, other` |
| ask_detail | text | the full ask, free text |
| ask_line | text | a short phrase used in follow-up templates: "a members' discount at Rosa's Thai" |
| exclusivity | text not null default 'none' | `none, offered, agreed, declined` |
| exclusivity_category | text | "men's grooming", "shirts" |
| signed_by | text not null default 'albert' | `albert, kira` |
| stage | text not null default 'not_started' | `not_started, researching, ready, contacted, replied, call_booked, in_talks, agreed, live, declined, no_reply, paused` |
| stage_at | timestamptz | when it last changed |
| next_call_at | timestamptz | shown on the KPI strip and in Due today |
| next_action, next_action_on | text, date | Albert's own reminder |
| hook, avoid, notes | text | "avoid" holds what not to mention (for example Hakkasan's lost star) |
| do_not_follow_up | boolean not null default false | no automatic follow-ups for this target |
| opted_out, opted_out_at, opted_out_note | boolean not null default false, timestamptz, text | the whole business asked us to stop |
| import_key | text unique | set only by the copy from Outreach_Log, so a second import changes nothing |
| created_at, updated_at | timestamptz | |

**`outreach_contacts`**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| target_id | uuid not null → targets on delete cascade | |
| name, role | text | null name for a group mailbox |
| mailbox_type | text not null | `named_person, founder, group_mailbox` |
| email | text | lower-case; unique per target |
| email_source | text not null default 'unknown' | `rocketreach, apollo, published, albert, guessed, their_reply, unknown` |
| source_note | text | "RocketReach grade A; server check valid 11 Nov" |
| email_status | text not null default 'unknown' | `unknown, valid, bounced` |
| email_checked_at | timestamptz | |
| linkedin_url | text | public profile only |
| is_primary | boolean not null default false | the person a follow-up is addressed to |
| opted_out, opted_out_at, opted_out_note | | this person asked us to stop |
| created_at, updated_at | timestamptz | |

No phone numbers and no home addresses (question 10.9).

**`outreach_touches`**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| target_id | uuid not null → targets on delete cascade | |
| sequence_id | uuid not null | the first touch's own id; follow-ups carry it |
| channel | text not null | `email, letter, linkedin, call, whatsapp, in_person` |
| kind | text not null | `first, follow_up, resend, forward, conversation` (conversation: Albert's later messages in a live thread; not counted as outreach sent) |
| step | smallint | 0 first, 1 and 2 email follow-ups, 3 the letter; null for conversation |
| status | text not null | `planned, queued, drafted, sent, posted, failed, cancelled, unconfirmed` (unconfirmed: found by the drafter in Sent Items, waiting for Albert) |
| subject, version, attachment, file_ref | text | file_ref: the OneDrive path of the .eml or letter PDF |
| eml_sha256 | text | unique when set: one touch per .eml |
| sent_at | timestamptz | email: Outlook's sent time; letter: the posted date (12:00); call: when |
| letter_posted_on, letter_class | date, text | `first, second, signed_for` |
| outlook_draft_id, outlook_message_id, internet_message_id, conversation_id, web_link | text | internet_message_id unique when set |
| counts_in_stats | boolean not null default true | false for a non-outreach touch such as the WatchHouse heads-up |
| signed_by | text | |
| created_by | text not null | `albert, drafter, desk_chat, import` |
| note | text | |
| created_at, updated_at | timestamptz | |

**`outreach_touch_recipients`**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| touch_id | uuid not null → touches on delete cascade | |
| contact_id | uuid → contacts on delete set null | |
| address | text | a copy at send time; cleared when the person is deleted |
| role | text not null | `to, cc` |
| delivery | text not null default 'unknown' | `unknown, delivered, bounced` |
| bounced_at, bounce_code | timestamptz, text | "5.1.1" |

**`outreach_outcomes`**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| target_id | uuid not null → targets on delete cascade | |
| sequence_id, touch_id | uuid (touch_id → touches on delete set null) | the touch it answers |
| contact_id | uuid → contacts on delete set null | who wrote back |
| kind | text not null | `reply, auto_reply, bounce, delay, opt_out_request` |
| channel | text not null | `email, letter, phone, linkedin, whatsapp, in_person` |
| sentiment | text | `positive, neutral, negative`, set by Albert |
| received_at | timestamptz not null | |
| from_address, from_name | text | cleared when the person is deleted |
| subject | text | |
| preview | text | replies only: Outlook's `bodyPreview` (up to 255 characters); never for automatic mail |
| summary | text | Albert's words |
| bounced_address, bounce_code | text | |
| graph_message_id, internet_message_id, conversation_id, web_link | text | internet_message_id unique when set |
| match_method | text not null | `conversation, headers, sender, domain, manual` |
| confirmed | boolean not null default true | false: a probable match waiting in the review list |
| is_first_reply | boolean not null default false | the first human reply in its sequence (time to reply uses it) |
| reply_seconds | integer | from the answered touch's sent_at |
| created_by | text not null | `albert, drafter, import` |
| created_at | timestamptz | |

**`outreach_stage_history`**: id, target_id (cascade), from_stage, to_stage, at, by (`albert, drafter, import`),
note. The funnel counts stages ever reached, so a target that went straight from replied to agreed still counts as
having passed call booked only if it did.

**`outreach_followups`**

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| target_id, sequence_id | uuid not null | |
| step | smallint not null | 1, 2, 3; unique with sequence_id |
| channel | text not null | `email, letter` |
| due_on | date not null | from the rules (section 4.1) |
| snoozed_until | date | the effective due date is the later of the two |
| status | text not null default 'scheduled' | `scheduled, drafted, done, skipped, paused, cancelled` |
| reason | text | `replied, bounced, opted_out, no_address, no_reply_left, manual` |
| draft_touch_id | uuid → touches on delete set null | the follow-up draft, once made |
| stale_draft | boolean not null default false | a reply came after the draft was made |
| decided_by, created_at, updated_at | | |

**Phase 2 tables**

- `outreach_drafter_keys`: id, label, key_hash (SHA-256 hex, unique), created_at, created_by, last_used_at,
  revoked_at. At most one key without `revoked_at`.
- `outreach_sync_runs`: id, key_id, started_at, finished_at, ok, counts jsonb (numbers only), message. Rows older
  than 90 days are removed by the next run.
- `outreach_templates`: id, step (unique), html, updated_at, updated_by. The follow-up wording (section 4.7).

### 2.5 Views

`outreach_sequences_v`, one row per sequence: target, first channel, first sent date, mailbox type and address source
of the main To contact, delivered (yes or no), first reply time, first reply sentiment, stages reached, still open
(follow-ups scheduled). Created `with (security_invoker = true)` so RLS applies through the view (Supabase views run
as their owner otherwise), and revoked from `anon` and `authenticated` like the tables. KPIs and charts read this view.

### 2.6 Indexes

- targets: `(stage)`, `(category)`, `gin (domains)`.
- contacts: `(target_id)`, `(email)`; unique `(target_id, email) where email is not null`.
- touches: `(target_id, sent_at desc)`, `(sequence_id)`, `(conversation_id)`, `(status)`, `(sent_at desc)`;
  unique `(internet_message_id)`, `(eml_sha256)`, `(outlook_draft_id)`, each `where ... is not null`.
- recipients: `(touch_id)`, `(address)`, `(contact_id)`.
- outcomes: `(target_id, received_at desc)`, `(sequence_id)`, `(confirmed) where not confirmed`; unique
  `(internet_message_id) where internet_message_id is not null`.
- followups: `(status, due_on)`; unique `(sequence_id, step)`.

### 2.7 RLS

Every `outreach_` table and view: RLS on, **no policies**, and `revoke all ... from anon, authenticated`. Only the
service role reads or writes them, and the service role is used only inside server code that has already passed
`requireOwner()` (screens and actions) or the drafter key check (the drafter route). This matches the live pattern
(admin pages read through the service role; `admin_users` has RLS and no policies). A signed-in admin such as Kira,
calling Supabase's REST API with her own session, gets nothing from these tables.

### 2.8 Migration names (not written yet)

| Phase | Migration | Undo |
|---|---|---|
| 1 | `supabase/migrations/20261117090000_outreach_desk.sql`: owner flag, targets, contacts, touches, recipients, outcomes, stage history, follow-ups, the view, RLS | `release/undo-outreach-desk.sql`; plus `release/set-desk-owner.sql` |
| 2 | `supabase/migrations/20261124090000_outreach_drafter_link.sql`: drafter keys, sync runs, templates | `release/undo-outreach-drafter-link.sql` |
| 3 | `supabase/migrations/20261201090000_desk_alex.sql`: draft texts, guidance, connector grants, agenda runs (section 0.1) | `release/undo-desk-alex.sql` |
| 4 | none expected; if the charts need more from the view, `20261208090000_outreach_analytics_view.sql` | |

The timestamps are placeholders: each is set when the phase is built, after the newest migration on main.

---

## 3. Capture design

### 3.1 Who records what

| Event | Recorded by | How |
|---|---|---|
| Email queued by the desk chat | the drafter (Phase 2) | reads the metadata file beside the .eml (3.2) and tells the desk when it drafts it |
| Email drafted | the drafter | draft id, conversation id and Outlook link sent to the desk |
| Email sent | the drafter | finds it in Sent Items by its hidden key (3.4) |
| Email Albert writes by hand to a known address | the drafter | found in Sent Items, put in the review list for Albert to confirm |
| Reply, bounce, out-of-office | the drafter | found in the mailbox, classified (3.5), matched (3.6) |
| Letter posted | Albert, by hand | "Letter posted" form |
| Reply to a letter by phone or post | Albert, by hand | "Log a reply" form |
| LinkedIn message, call | Albert, by hand | "Add a touch" form |
| Stage (call booked, agreed, live) | Albert | stage menu on the target; the drafter only moves contacted to replied |
| Everything in Phase 1 | Albert, by hand | the forms in section 5.4 |

### 3.2 How the desk chat adds a record when it queues an email

The desk chat (the partner-emails and email-drafts skills) runs in the cloud and must not hold any key to the desk.
So it writes a small metadata file beside each email it queues:

```
Partner emails/Rosas Thai/Email to Rosas Thai - ready to send.eml
Partner emails/Rosas Thai/Email to Rosas Thai - ready to send.desk.json
```

```json
{
  "v": 1,
  "target": { "name": "Rosa's Thai", "category": "restaurant", "domains": ["rosasthai.com"],
              "ask": "extend_member_offer", "askLine": "a members' discount at Rosa's Thai",
              "exclusivity": "none", "signedBy": "albert" },
  "to": [{ "name": "Naomi Davies", "role": "Head of Marketing", "email": "naomi@rosasthai.com",
           "mailboxType": "named_person", "source": "rocketreach",
           "sourceNote": "RocketReach grade A, server check valid 11 Nov" }],
  "cc": [],
  "touch": { "kind": "first", "version": "v1", "attachment": "Club Yuppie x Rosas Thai - partner overview.pdf" }
}
```

It holds only what the email already holds plus the professional source note. No secrets. When the drafter drafts the
.eml it sends this to the desk with the draft's ids. The desk creates or updates the target, contacts and touch
(status `drafted`). A `.desk.json` with `"kind": "follow_up"` and `"followsTouch": "<touch id>"` asks the drafter to
put a bespoke follow-up into the existing thread instead of a new email (section 4.3).

The two skills would need a small change to write this file (Albert approves skill changes). Until then, the desk
still records the email when it is sent, through the "unlogged send" review (3.4 step 5).

### 3.3 How the drafter authenticates to the desk

The drafter runs on Albert's Mac. It must never hold the Supabase service-role key. Four ways to let it write:

| Option | For | Against |
|---|---|---|
| **A. A narrow server route on the website** (`/api/desk/drafter/[action]`) with its own revocable key | Same code base, deploy, tests and `audit()` as everything else; the route accepts only a few fixed shapes; revoking is one click; no new runtime | Each call is a Vercel function (about 100 a day: nothing on Hobby); 60-second limit per call, so batches stay small |
| B. A Supabase Edge Function with its own key | Runs next to the database | A new runtime (Deno) and deploy step the repo doesn't use; tests and audit written twice |
| C. A database function called through Supabase's REST API with the public key plus the desk key | No server code | The function is reachable from the internet by anyone with the public key; all logic in PL/pgSQL, harder to test; audit in SQL |
| D. The drafter signs in to Supabase as Albert | Reuses RLS | Needs Albert's password and authenticator code on a timer (aal2): breaks the rule on codes, and gives the drafter all of Albert's admin powers |

**Recommendation: A.** The key:

1. Albert runs `draft-partner-emails desk-link` on the Mac. It makes a random key (32 bytes, `secrets.token_urlsafe`),
   saves it in the Keychain (service `club-yuppie-desk`, the same way as the Microsoft sign-in: through `security -i`
   on standard input, never on a command line), and shows only its **fingerprint** (the SHA-256 of the key). The key
   itself is never shown, printed, written to a file or put in the chat.
2. Albert pastes the fingerprint into Desk > Settings > "Link the drafter" (owner, aal2). The desk stores the
   fingerprint, not the key. A fingerprint cannot be turned back into the key, so seeing it is harmless.
3. Each call sends `Authorization: Bearer <key>` over HTTPS. The route hashes it, compares it in constant time with the
   active fingerprint, and refuses everything else with 401. It records `last_used_at`.
4. "Unlink the drafter" (or `draft-partner-emails desk-unlink`, which deletes the Keychain item) stops it at once.
   Re-link every six months (question 10.5).

What the key allows, and nothing more:

| Action | Does |
|---|---|
| `GET hello` | checks the key; returns the server time |
| `POST check` | for a list of addresses: opted out, already contacted (with date) or fine |
| `POST drafted` | records a drafted email from its `.desk.json` (creates the target, contacts and touch if new) |
| `GET plan` | what to look for: open sequences (draft ids, keys, conversation ids, recipients), target addresses and domains, the time of the last sync, follow-ups due today with their recipients and wording |
| `POST report` | sends found, replies, bounces, automatic replies, unlogged sends, follow-up drafts made, stale drafts; each item idempotent by its message id |

It cannot delete anything, change an opt-out, change a stage beyond contacted to replied, read anything outside the
desk (members, payments, applications), or reach any endpoint that sends. Every write is one `admin_audit` row with
`admin_id` null, `action` `desk.drafter.<action>` and details holding ids and counts only. Requests over 256 KB or
more than 120 a minute are refused.

### 3.4 A sync run, step by step (Phase 2)

Each run of `draft-partner-emails` (on demand, in `--watch`, or every 15 minutes from a Mac schedule if Albert agrees,
question 10.6) does this after its usual drafting:

1. **Before drafting** each waiting .eml that has a `.desk.json`, or sits under `Partner emails/`: `POST check` with
   its addresses. An opted-out address is not drafted (the marker says `"blocked": "opted out"`). If the desk can't be
   reached, these outreach emails wait for the next run; other emails in `Emails to draft` are drafted as today.
2. **After drafting:** `POST drafted` with the `.desk.json`, `emlSha256`, the draft's `id`, `conversationId` and
   `webLink`. Today's marker JSON stays as it is, plus `"desk": "recorded"`.
3. `GET plan`.
4. **Sent?** For each open touch:
   - `GET /me/mailFolders('SentItems')/messages?$filter=singleValueExtendedProperties/Any(ep: ep/id eq
     '<ClubYuppieDraftKey>' and ep/value eq '<sha256>')&$select=id,sentDateTime,internetMessageId,conversationId,
     toRecipients,ccRecipients,subject,webLink`. The tool's `existing()` already searches by this property and
     expects it to survive sending; the spike (Phase 2, step 1) confirms it.
   - If none: `GET /me/messages/<draftId>?$select=isDraft`. Still a draft: not sent yet. Gone (404): look in Sent
     Items by `conversationId`; if still nothing, report "draft gone, not sent?" for Albert.
5. **Unlogged sends:** `GET /me/mailFolders('SentItems')/messages?$filter=sentDateTime ge <since>&$select=...`.
   A message to an address or domain the desk knows, that is not already a touch, is reported as `unconfirmed`
   (a forward, a resend typed by hand, or Albert's later message in a thread). Messages to anyone else never leave
   the Mac.
6. **Incoming mail:** `GET /me/messages?$filter=receivedDateTime ge <since minus 1 hour> and isDraft eq false
   &$select=id,receivedDateTime,from,sender,toRecipients,ccRecipients,subject,conversationId,internetMessageId,
   bodyPreview,webLink,parentFolderId&$expand=singleValueExtendedProperties($filter=id eq 'String 0x001A')`,
   paged. This covers every folder, Junk included. Messages from Albert himself are skipped. The expanded property is
   the Exchange message class (3.5).
7. For each message that matches (3.6): `GET /me/messages/<id>?$select=internetMessageHeaders` for `In-Reply-To`,
   `References`, `Auto-Submitted` and the report headers; classify it; report it. Unmatched messages are dropped on the
   Mac and never sent to the desk.
8. **Follow-ups due today:** make the in-thread drafts (section 4.3) and report them.
9. **Stale drafts:** for each follow-up draft the desk marks stale, see 4.5.
10. `POST report` with everything, and the run's counts for `outreach_sync_runs` (the desk shows "Drafter: synced 4
    min ago").

Reading mail never changes it: GETs don't mark anything as read.

### 3.5 Telling a bounce, an out-of-office and a reply apart

Checked in this order; the first that fits wins.

| Kind | Signals |
|---|---|
| **Bounce** (non-delivery report) | message class `REPORT.IPM.Note.NDR` (Exchange's own reports); or `Content-Type: multipart/report; report-type=delivery-status` with `Action: failed` (RFC 3464); or from `postmaster@`, `mailer-daemon@` or "Microsoft Outlook" with a subject starting "Undeliverable:", "Delivery Status Notification (Failure)" or "Mail delivery failed". The failed address and status code (for example `5.1.1`) come from `Final-Recipient` and `Status`, or the report's text |
| **Delay notice** | `Action: delayed`, or a subject starting "Delivery delayed" / "Delay". Logged, changes nothing |
| **Receipts** | message class `REPORT.IPM.Note.DR` (delivered) or `REPORT.IPM.Note.IPNRN` (read). Ignored |
| **Out-of-office or other automatic reply** | message class `IPM.Note.Rules.OofTemplate.Microsoft` (Exchange); or `Auto-Submitted` with any value except `no` (RFC 3834: `auto-replied`, `auto-generated`); or `X-Autoreply`, `X-Autorespond`, `Precedence: auto_reply`; or a subject starting "Automatic reply:", "Auto:", "Out of Office". Ticket systems' "we've received your email" land here too. Logged as `auto_reply`; it does not count as a response and does not stop follow-ups |
| **Reply** | everything else that matches. A calendar invitation (message class `IPM.Schedule.Meeting.Request`, as Desh sent on 13 Nov) counts as a reply and gets a "call?" hint; the call time is entered by Albert |

A reply containing "unsubscribe", "remove me", "not interested" or "don't contact" is flagged "possible opt-out" for
Albert to decide. The desk never decides that itself.

### 3.6 Matching rules

In this order:

1. **Conversation:** `conversationId` equals a tracked touch's or a tracked reply's conversation. Confirmed.
2. **Headers:** `In-Reply-To` or `References` holds one of our sent messages' `internetMessageId`. Confirmed. This
   catches replies whose conversation id differs.
3. **Sender:** the sender's address is a known contact. Matched to that target's newest open sequence. Confirmed.
4. **Domain:** the sender's domain is one of a target's `domains`, and not a free-mail domain (gmail.com,
   googlemail.com, outlook.com, hotmail.com, hotmail.co.uk, live.com, icloud.com, me.com, yahoo.com, yahoo.co.uk,
   aol.com, btinternet.com, proton.me, protonmail.com). Probable: goes to the review list (`confirmed = false`) until
   Albert confirms it.
5. **Bounces** also match by the failed address against recipients emailed in the last 7 days, then by the subject
   "Undeliverable: <our subject>".
6. Anything else: not matched, not stored, never leaves the Mac.

### 3.7 Edge cases

- **A forwarded email (Hakkasan, 11 Nov).** Two ways round:
  - Albert forwards or re-sends his email to a new address. Step 5 finds it in Sent Items (same conversation, or
    `References` pointing at our message) and reports a touch of kind `forward` or `resend` in the same sequence. The
    new address becomes a contact with source `unknown` and the review list asks Albert where it came from. Hakkasan's
    v6 to Lauren Pestell after the two ukpress@ bounces is a `resend`, so Hakkasan is still one sequence.
  - The recipient forwards it inside their company and a colleague replies. Rules 1 or 2 match it if the colleague
    replies in the thread; rule 4 if they start a new email from the same domain. The colleague becomes a new contact
    with source `their_reply`.
- **A reply from a different person (Padium).** Houman replied by email to a letter, so there was no thread: rule 4
  (padium.com) puts it in the review list; Albert confirms; Houman becomes a contact (founder). Desh then wrote in
  Houman's thread: rule 1 (the reply's conversation is tracked too). Desh is added as a contact ("Executive Assistant
  to Houman"). Only the first human reply in a sequence counts for response rate and time to reply; later messages
  sit on the timeline.
- **Replies in a new thread.** Rules 2 to 4. A reply from someone's personal address in a new thread can't be matched
  safely, so it isn't; Albert logs it by hand.
- **Several recipients (Nobu: To events-portmansquare@, Cc Jason Burton).** One touch, two recipient rows. The
  sequence counts once. Its mailbox type is the To address's (group mailbox). A bounce marks only the address that
  bounced; the sequence is still delivered if another address wasn't refused. A reply from either counts.
  Follow-ups go to the same To and Cc, minus bounced or opted-out addresses and minus Albert.
- **Every address bounced (Headmasters, 10 Nov; Hakkasan ukpress@, 11 Nov).** The sequence shows "Needs a new
  address" and its follow-ups pause. A resend to a new address carries on the same sequence and restarts the
  follow-up clock from the resend.
- **Two targets on one domain (Nobu Portman Square and Nobu Old Park Lane on nobuhotels.com).** Rule 4 is ambiguous,
  so the review list offers both.
- **An automatic acknowledgement, then a real reply later.** The first is `auto_reply`, the second the reply.
- **A reply after the follow-up draft was made but before Albert sent it.** The follow-up is cancelled and its draft
  marked stale (4.5).
- **A reply that lands in Junk.** Step 6 reads all folders.
- **Albert answers in the thread himself.** Step 5 logs it as a `conversation` touch, so the timeline is complete and
  the outreach counts are unchanged.

### 3.8 Permissions: nothing new needed

Everything above uses calls covered by the drafter's existing delegated **Mail.ReadWrite**: reading Sent Items, Inbox
and other folders, `internetMessageHeaders`, extended properties, `createReplyAll` and `createReply` (they only make
drafts), PATCH on a draft, and moving a draft to Deleted Items. **No new permission and no Entra change.**

What **would** need a new permission or an Entra change, and is therefore not in this plan:

- Reading Albert's calendar to fill in call times from invitations: `Calendars.Read`.
- Reading or drafting from a shared mailbox such as hello@: `Mail.ReadWrite.Shared` (and the mailbox shared with
  Albert).
- Any server-side Microsoft access (the website reading mail itself): a confidential app with a secret or
  certificate and application permissions. Not wanted: the Mac stays the only place that can read mail.

Changing the drafter's code to do the above is a change Albert must approve (Phase 2).

---

## 4. Follow-up engine

### 4.1 The rules

Working days are Monday to Friday, excluding England and Wales bank holidays (2026 and 2027 listed in
`lib/server/outreach/rules.ts`, checked against gov.uk when built, with a reminder to add 2028). 21 December to
1 January also counts as non-working every year, so no follow-up falls due over Christmas (Albert, 15 Nov).

Each count starts only when the email or letter before it has actually gone out (Albert, 16 Nov):

| Step | Channel | Due | Example |
|---|---|---|---|
| 1 | email, in the thread | 7 working days after the first email was sent | first email Thu 12 Nov: Mon 23 Nov |
| 2 | the January email, in the thread | the January round (question 10.33): no second follow-up before then | week of Mon 11 Jan 2027 |

Only one follow-up, then the partner is left until the middle of January, when launch is close and a third email
has something new to say (Albert, 16 Nov). The January email goes to everyone still without a reply.

**When a letter goes first** (Albert, 16 Nov): follow-up 1 is an email 10 working days after posting (Hawes &
Curtis, posted Mon 9 Nov: Mon 23 Nov), then the January email as above. With no email address for the person or the
business, Due today shows "Needs an email address" so one can be found (RocketReach first).

When a touch becomes `sent` or `posted` as a first touch (or a resend after every address bounced), the desk creates
follow-up 1. Each later step is created when the one before it actually goes out, so a late send never bunches two
together. A target marked "Do not follow up" (WatchHouse) gets none.

### 4.2 Where they run

- **The rules run in the website's server code**, at the moment something happens: a send creates the follow-ups, a
  reply, bounce or opt-out cancels or pauses them, a snooze moves them. They are stored rows, so "Due today" is a
  simple query and the history is kept.
- **The drafts are made by the drafter on the Mac**, the only place that can reach Outlook. They are made the night
  before the due date, so Albert reviews them on the morning they go out (Albert, 16 Nov). Each run from 21:00 asks
  the desk what is due the next day (`GET plan`) and makes those drafts. If the Mac is asleep or off, they are made
  the moment it next runs, and the 6:30 agenda says which are missing (question 10.25).
- **pg_cron: not needed.** Nothing has to happen at a set time on the server. If later wanted (for example a weekly
  summary email to Albert), it is one more job in `release/schedule-cron.sql` calling `/api/cron/desk`, following
  the existing pattern.

### 4.3 How a follow-up draft is made in the thread

Graph's documentation describes `createReply` as a reply to the sender. On Albert's own sent message the sender is
Albert, so the drafter sets the recipients itself:

1. Find the newest of our sent messages in the sequence's conversation (the first email, or follow-up 1).
2. `POST /me/messages/<id>/createReplyAll` with no body. Outlook returns a draft in the same conversation, subject
   "RE: ...", with the earlier email quoted below.
3. `PATCH /me/messages/<draftId>` with:
   - `toRecipients` and `ccRecipients` from the desk (the original To and Cc minus bounced, opted-out and Albert);
   - `body`: the follow-up text plus Albert's signature, put above the quoted email in the HTML Outlook returned in
     step 2;
   - the hidden `ClubYuppieDraftKey` set to `followup:<followup id>`, so a second run finds it instead of making
     another.
4. No attachment: the overview PDF is already in the thread.
5. If any step fails, the half-made draft is deleted (as the tool already does when a PDF upload fails), and the
   failure is reported to the desk.
6. Report the draft id and Outlook link. "Due today" then shows "Draft ready" with a link that opens it in Outlook.

The code calls only `createReply`, `createReplyAll` and PATCH. It never calls `/send`, `/reply`, `/replyAll` or
`/forward`: those send at once (and need Mail.Send, which the tool refuses). A test fails if any of those paths appears
in the source.

The spike at the start of Phase 2 checks, on a test email Albert sends to himself: what `createReplyAll` fills in on
a sent message, that the PATCHed recipients hold, that the quoted thread survives the body change, and that the
hidden key survives sending.

### 4.4 Pausing, snoozing and skipping

On the Due today list, the target page and the blotter:

| Control | Effect |
|---|---|
| **Snooze to a date** | moves this follow-up's effective due date (for example after an out-of-office "back on 23 Nov") |
| **Skip** | this step is marked `skipped`; the next step keeps its own date |
| **Pause sequence** | every remaining step waits; on Resume, each is due no earlier than the next working day |
| **Stop sequence** | every remaining step is cancelled with reason `manual`; Albert can add a note |
| **Do not follow up** (target) | no follow-ups are ever created for it |

Each is a server action that checks the owner and writes an audit row.

### 4.5 How it stops when someone replies

- A confirmed **reply** from anyone at the target cancels every remaining step in that sequence (reason `replied`) and
  moves the stage to `replied` if it was `contacted`.
- An **opt-out** cancels everything for that person (or the whole target) and blocks new touches and drafts.
- A **bounce** of every address pauses the sequence until a resend.
- An **automatic reply** changes nothing; Albert can snooze.
- **Stale drafts:** if a reply arrives after a follow-up draft was made and before Albert sent it, the follow-up is
  cancelled and the draft marked stale. The desk shows "Delete the follow-up draft in Outlook". On the next run the
  drafter moves the stale draft to Deleted Items (recoverable) only if Albert hasn't edited it since it was made
  (`lastModifiedDateTime` unchanged); an edited draft is left alone and stays flagged (question 10.8).

### 4.6 The letter step

A letter can't be drafted in Outlook. On its due date "Due today" shows "Letter due", with the target's postal
address. Albert asks the desk chat for it (the venue-partner-letters skill), and when it is posted logs "Letter
posted". With no postal address the step is skipped (reason `no_address`) and the sequence closes after step 2.

### 4.7 The wording

Superseded on 16 Nov: Alex writes each draft in Albert's voice from guidance Albert approves for each kind of email
(section 0). The template design below is kept for the record.

Each email step uses a template stored in the desk (`outreach_templates`, Phase 2): Albert's wording with three fields,
the first name (or "team" for a group mailbox), the target's name and its `ask_line`. Claude writes the first two
templates in Albert's voice (British English, no em dashes or exclamation marks, "Club Yuppie"), each ending with a
one-line way to opt out ("If you'd rather I didn't write again, just say and I won't."). The flow is built first and
Albert approves the templates afterwards (Albert, 16 Nov). Until a step has an approved template, Due today shows
"Template needed" and no draft is made for it. Albert can edit any draft in Outlook before sending. For a bespoke follow-up, the desk chat writes it as a
`.desk.json` with `"kind": "follow_up"` (3.2) and the drafter puts that text into the thread instead.

---

## 5. Screens

### 5.1 The trading-desk style

The admin bar stays as it is (yellow, with a "Desk" link that only the owner sees). Below it the desk is a dark
trading screen built only from the console's tokens (`app/admin/admin.css`):

| Use | Token |
|---|---|
| Page background | `--ink` #1B1512 |
| Text | `--cream` #F5F3E7; secondary text at 64% opacity; grid lines at 12%; row hover at 6% |
| Due today, late, the selected row, focus | `--yellow` #FFD904 (a 2px bar on the left of the selected row) |
| Drafted | `--pale` #FFF3B0 fill, ink text |
| Positive reply, delivered | `--success` #2F6B3A fill, cream text |
| Negative reply, bounced, opted out | `--error` #B3261E fill, cream text |
| Automatic reply, paused | `--muted` #57514C fill, cream text |
| Queued | dashed cream outline |

- Type: Almarai throughout, 13px in tables and 11px uppercase labels with 0.08em letter-spacing. Instrument Serif
  italic only for the page title. Numbers right-aligned in tabular figures; if Almarai has no tabular figures (checked
  in Phase 1), number cells use `ui-monospace, SFMono-Regular, Menlo`.
- Rows 28px high at desktop width, a sticky header row, no cards around tables.
- Colour is never the only signal: every chip has a word (SENT, DRAFTED, REPLIED +, BOUNCED, OOF, LATE), and every
  change has an arrow and a number ("▲2 vs last week").
- Keyboard (Phase 4, optional): `/` search, `j`/`k` move, `Enter` open, `n` new touch, `r` log a reply.

### 5.2 Desk home (`/admin/desk`)

```
[ existing yellow admin bar:  Dashboard  Applications  Members  ...  Payments  DESK ]
+--------------------------------------------------------------------------------------------------------------+
| Outreach desk                    Thu 19 Nov 2026 09:12   Drafter: synced 4 min ago   [+ Target] [+ Touch]      |
|                                                                                       [Letter posted] [Reply]  |
+-----------------+-----------------+-----------------+-----------------+-----------------+--------------------+
| SENT THIS WEEK  | RESPONSE RATE   | POSITIVE RATE   | CALLS BOOKED    | PARTNERS LIVE   | DUE TODAY          |
|        6        |      25%        |      25%        |        1        |        0        |    4               |
| E5 L1  ▲2 vs lw | 2 of 8          | 2 of 8          | Padium Fri 12:00| 0 agreed        | 1 late             |
+-----------------+-----------------+-----------------+-----------------+-----------------+--------------------+
| DUE TODAY                                                                                                      |
| LATE   Wed 18 Nov  Nobu Portman Square   FU1 email  events-portmansquare@ +1   Draft ready >   Snooze  Skip      |
| TODAY  Thu 19 Nov  Rosa's Thai           FU1 email  naomi@rosasthai.com      Draft ready >   Snooze  Skip      |
| TODAY  Thu 19 Nov  Hakkasan Mayfair      FU1 email  lauren.pestell@          Waiting for drafter  Snooze  Skip |
| CALL   Fri 20 Nov  Padium                12:00, 15 minutes with Houman Ashrafzadeh                             |
| REVIEW 2 to check: 1 probable reply (padium.com), 1 email you sent by hand                       Open review > |
+--------------------------------------------------------------------------------------------------------------+
| BLOTTER  [Channel: all v] [Stage: all v] [Category v] [Source v] [Since 1 Nov v] [Search            ]  31 rows |
| SENT v        TARGET              CH STEP  TO (SOURCE)                    STATUS     REPLY      DAYS  STAGE  NEXT |
| 12 Nov 10:02  Hakkasan Mayfair    E  R     lauren.pestell@ (RR)           SENT       -          5   Cont.  FU1 19|
| 12 Nov 09:40  Flight Club / ES    E  1     juliette.keyte@ (RR)           SENT       -          5   Cont.  FU1 19|
| 12 Nov        Rosa's Thai         E  1     naomi@ (RR)                    SENT       -          5   Cont.  FU1 19|
| 12 Nov        Everyman            E  R     privatehire@ (pub)             SENT       -          5   Cont.  FU1 19|
| 11 Nov        Hakkasan Mayfair    E  1     ukpress@ x2 (guess)            BOUNCED    5.1.1      -   -      -     |
| 11 Nov        Everyman            E  1     adam.reynolds@ (Albert)        BOUNCED    -          -   -      -     |
| 11 Nov        Nobu Portman Sq     E  1     events-portmansquare@ +1 (pub) SENT       -          6   Cont.  LATE  |
| 10 Nov 00:56  Pall Mall Barbers   E  1     marketing@ (?)                 REPLIED +  7.5 h      0   Repl.  Call? |
| 10 Nov        Headmasters         E  1     corporate@ (guess)             BOUNCED    -          -   New address    |
| 9 Nov         Padium              L  1     Houman Ashrafzadeh (Albert)    REPLIED +  3 d        3   Call   20 Nov|
+--------------------------------------------------------------------------------------------------------------+
```

For illustration only: the rows and the response figures come from the log as it stands, but "sent this week" and
the clock times are made up. The blotter shows one row per touch (conversation touches
are hidden unless "Show conversation" is ticked). Every column sorts; the filters are kept in the address (search
parameters), so the page stays a server component and a filtered view can be bookmarked. Clicking a row opens the
target.

### 5.3 A target's page (`/admin/desk/t/[id]`)

```
< Desk    HAKKASAN MAYFAIR    Restaurant · Hakkasan Group · hakkasangroup.com, hakkasan.com
Stage [Contacted v]   Ask: members' discount   Exclusivity: none   Signed by: Albert   Next call: -
[Edit]  [Do not follow up]  [Opted out]  [Delete...]

NEXT   FU1 email due Thu 19 Nov (5 working days)   [Snooze]  [Skip]  [Pause sequence]  [Stop]

CONTACTS                                                                                        [+ Contact]
  Lauren Pestell   Senior Marketing Manager, UK and International   named person
                   lauren.pestell@hakkasangroup.com   RocketReach (grade A, server check valid 11 Nov)   VALID
  UK press         ukpress@hakkasangroup.com   group mailbox   guessed            BOUNCED 11 Nov
  UK press         ukpress@hakkasan.com        group mailbox   guessed            BOUNCED 11 Nov
  Events           events@hakkasan.com         group mailbox   published (2026 brochure)   not used

TIMELINE (newest first)                                                       [+ Touch]  [Log a reply]
  Thu 12 Nov 10:02   EMAIL SENT    v6 resend   to Lauren Pestell   "Club Yuppie partnership ..."   PDF   Outlook >
  Wed 11 Nov 18:40   BOUNCE        ukpress@hakkasan.com   5.1.1 recipient not found
  Wed 11 Nov 18:39   BOUNCE        ukpress@hakkasangroup.com   5.1.1
  Wed 11 Nov 18:31   EMAIL SENT    v5 first   to ukpress@hakkasangroup.com, ukpress@hakkasan.com
  ...

NOTES   Hook: 25 years since the first Hakkasan (2001).
        Avoid: the Michelin star lost in 2024; Hanway Place closed Feb 2025; don't use taogroup.com.
```

The clock times and the bounce code are made up for the wireframe; the address sources follow question 10.11.

### 5.4 Forms

All open as dialogs (the console's existing `dialog.tsx`), each a server action that checks the owner and writes an
audit row.

- **Target:** name*, category*, group, domains, website, postal address, ask*, ask detail, ask line, exclusivity and
  its category, signed by, stage, hook, avoid, notes.
- **Contact** (on a target): mailbox type*, name, role, email, address source*, source note, LinkedIn profile,
  primary, opted out.
- **Add a touch:** target*, channel*, kind* (first, follow-up, resend, forward, conversation), to and cc (picked
  from the target's contacts, or a new contact), sent date and time*, subject, version, attachment, file, signed by,
  note. Counts in stats (ticked).
- **Letter posted:** target*, addressee*, letter file, version, posted date*, class (first, second, signed for),
  note. Creates a `letter` touch with status `posted` and its follow-ups.
- **Log a reply:** target*, the touch it answers (newest by default), from (a contact, or a new person: name, role,
  email), received date and time*, channel (email, phone, letter, LinkedIn, WhatsApp, in person), kind (reply,
  automatic reply, bounce, delay, asked to stop), sentiment (positive, neutral, negative), call booked for (optional:
  sets the stage and next call), Albert's summary, "opted out" tick.
- **Delete a person / Delete a target:** a dialog that lists what will be removed and says it can't be undone
  (section 8.4).
- **Review list** (Phase 2): each probable reply or unlogged send with "Confirm", "Not this target" (choose another),
  "Ignore".

### 5.5 Analytics (`/admin/desk/analytics`, Phase 4)

A window picker at the top ("Since 1 Nov" by default; This week; Last 4 weeks; a date range) and a "settled only"
tick (sequences started at least 15 working days ago, so recent ones don't drag rates down). Every chart is a small
server-rendered SVG with its numbers printed on it, and a "Show table" link under it.

| # | Chart | Plots |
|---|---|---|
| A1 | Response rate by channel | bars for email, letter, LinkedIn, call: rate, labelled "25% (2 of 8)" |
| A2 | The touch that got the reply | replies by the last touch before them: first, follow-up 1, follow-up 2, letter |
| A3 | Response rate by mailbox type | named person, founder, group mailbox |
| A4 | Bounce rate by address source | RocketReach, Apollo, published, supplied by Albert, guessed, their reply, unknown |
| A5 | Response rate by category | one bar per category |
| A6 | Response rate by ask | one bar per ask |
| A7 | Weeks | stacked columns per week sent (Monday to Sunday): replied, open, closed with no reply; the rate printed above |
| A8 | Time to reply | one dot per replied sequence on a working-days scale, split email and letter; the median marked |
| A9 | Funnel | contacted, replied, call booked, agreed, live: counts, % of contacted, % of the step before |
| A10 | Pipeline now | targets by current stage |
| A11 | Follow-up load | follow-ups due per day for the next 15 working days, late ones first |

### 5.6 Settings (`/admin/desk/settings`, Phase 2)

Link or unlink the drafter (fingerprint field, last used, last sync and its counts), the follow-up templates with a
preview filled in for a sample target, and the import (section 7).

### 5.7 On a phone

The desk works at 390px for checking, not heavy editing: the KPI strip becomes a two-column grid, Due today and
Review stay as lists, the blotter becomes two-line rows (target and status, then date, address and next), and charts
stack.

---

## 6. Analytics definitions

The set of sequences in a window is fixed by the date the sequence started (its first touch's sent or posted date, UK
time). Numerator and denominator always come from the same set. Replies are counted whenever they arrive, up to now.

| Measure | Numerator | Denominator | Window |
|---|---|---|---|
| **Response rate** | delivered sequences with a confirmed human reply | delivered sequences (at least one address not bounced, or a letter posted, a LinkedIn message sent, a call made) | started in the window; `counts_in_stats` touches only |
| **Positive rate** | delivered sequences whose first reply Albert marked positive | delivered sequences | as above |
| **By channel** (A1) | as response rate | as response rate | grouped by the first touch's channel |
| **Touch that got the reply** (A2) | replies after each kind of last touch | all replies | replies received in the window |
| **By mailbox type** (A3) | as response rate | as response rate | grouped by the mailbox type of the first touch's main To contact (a letter goes to a person: named person or founder) |
| **Bounce rate by source** (A4) | addresses that hard-bounced at least once | distinct addresses emailed | first emailed in the window; grouped by the contact's address source |
| **By category, by ask** (A5, A6) | as response rate | as response rate | grouped by the target's category or ask |
| **Weeks** (A7) | sequences started that week, split by state | | each week Monday to Sunday |
| **Time to reply** (A8) | for each replied sequence: from the first touch's sent time (a letter: its posted date) to the first human reply | | replied sequences started in the window. Under 48 hours it shows hours ("7.5 h"); otherwise whole working days. The median is shown with n; a letter's time includes postal delivery |
| **Funnel** (A9) | sequences whose target reached each stage (ever, from stage history) | delivered sequences | started in the window |
| **Sent this week** (KPI) | touches sent or posted, kinds first, follow-up, resend, forward | | Monday to now; split by channel; change against last week |
| **Response, positive** (KPI) | as above | | since 1 Nov 2026 |
| **Calls booked** (KPI) | targets that reached call booked or later | | since 1 Nov; the next call shown underneath |
| **Partners live** (KPI) | targets at stage live now | | now; agreed but not live shown underneath |
| **Due today** (KPI) | follow-ups scheduled or drafted with an effective due date today or earlier | | now; the late ones counted underneath |

Sample sizes:

- Every rate is written as a percentage with its counts: "25% (2 of 8)". Percentages are whole numbers.
- With nothing to count the chart shows "-" and "no data", never 0%.
- With fewer than 5 in the denominator the bar is drawn as an outline with diagonal hatching and labelled
  "small sample", so a 100% from one letter doesn't look like a result.
- Every chart title ends with its total n: "Response rate by channel (n = 7)".
- No decimals and no confidence intervals while the numbers are this small.

---

## 7. The copy from Outreach_Log

### 7.1 How each column maps

| Log column | Goes to | Notes |
|---|---|---|
| Venue | `targets.name`; "(email)", "(letter, not started)" become the first touch's channel or stage | |
| Addressee and role | one `contacts` row per person or address: name, role, email, mailbox type, address source, source note | free text such as "RocketReach grade A, server check valid 11 Nov" becomes `email_source` plus `source_note` |
| Hook | `targets.hook` | |
| The idea and ask | `targets.ask` (picked by hand), `ask_detail` (the text), `ask_line`; "Not mentioned" phrases go to `avoid` | |
| Signed by | `targets.signed_by` and each touch's `signed_by` | |
| Status / open before posting | `targets.notes` word for word; versions (v5, v6, v7) to `touches.version`; stage set by hand | nothing dropped |
| Sent | `touches`: status, date, recipients; "Follow-up due Thu 19 Nov" becomes a follow-up row | most cells have dates without times |
| Response | `outcomes` with date, time, who, kind and sentiment; later steps (Albert's reply-all, the WhatsApp) become conversation touches; the call becomes the stage and `next_call_at` | |
| Opted out | `contacts.opted_out` (all "No" today) | |
| Exclusivity policy | `targets.exclusivity` and its category per target; the policy text stays in the log | |
| Next targets | targets at stage `researching`, with their published addresses as contacts, no touches | |
| Excluded list | not imported | |

### 7.2 Row by row

| Log row | Target, category | Imported touches and outcomes | Stage |
|---|---|---|---|
| Flight Club and Electric Shuffle | activities | email 12 Nov to Juliette Keyte (RocketReach) | contacted, FU1 Thu 19 Nov |
| Nobu Portman Square | restaurant | email 11 Nov To events-portmansquare@, Cc Jason Burton (both published) | contacted, FU1 Wed 18 Nov |
| LAVO | restaurant | queued, not sent (Reena Pabari, supplied by Albert) | ready |
| Hakkasan Mayfair | restaurant | email 11 Nov to ukpress@hakkasangroup.com and ukpress@hakkasan.com, both bounced 11 Nov; resend 12 Nov to Lauren Pestell (RocketReach) | contacted, FU1 Thu 19 Nov |
| Noble Rot | restaurant or bar | none (letter not started); founders and hello@ as contacts | researching |
| Nobu London Old Park Lane | restaurant | none | researching |
| Rosa's Thai | restaurant | email 12 Nov to Naomi Davies (RocketReach); the letter dated 16 Nov kept as a planned step 3 | contacted, FU1 Thu 19 Nov |
| Pall Mall Barbers | grooming | email Tue 10 Nov 00:56 to marketing@; reply 10 Nov 08:26 from Richard Marshall (founder), positive; Albert's reply-all and WhatsApp as conversation touches | replied, "call to arrange next week" |
| Headmasters | hair_beauty | email 10 Nov to corporate@, bounced 10 Nov; marketing@, pr@ and info@ as contacts | contacted, needs a new address |
| Everyman | cinema | email to adam.reynolds@ (supplied by Albert), bounced 11 Nov; resend 12 Nov to privatehire@ (published) "FAO Adam Reynolds" | contacted, FU1 Thu 19 Nov |
| Ted's Grooming Room | grooming | none (no route to Mus) | paused |
| Hawes & Curtis | clothing | letter to Touker Suleyman posted Mon 9 Nov (Albert, 16 Nov); no reply yet | contacted |
| Padium | fitness | letter posted Mon 9 Nov (Albert, 16 Nov); reply 12 Nov 22:18 from Houman (founder), positive; Desh's messages 13 Nov; Albert's reply-all 13 Nov 12:18 | call booked, Fri 20 Nov 12:00 |
| Charles Tyrwhitt | clothing | none (to redo) | researching |
| Mayfair House Group | bar | none (to redo) | researching |
| The Salad Project | restaurant | none (to redo; signed by Kira) | researching |
| Upstairs at Langan's | restaurant | none (to redo; signed by Kira) | researching |
| WatchHouse | cafe | the 1 Nov heads-up from Albert's personal email, `counts_in_stats` false; nothing sent since (Albert, 16 Nov) | do not follow up |
| Cleménce (superseded) | | not imported | |
| Next targets 1 to 7 | dry_cleaning, fitness, hair_beauty | none | researching |

As it stands this gives 9 sequences started since 1 Nov (7 by email, 2 by letter), 8 delivered (Headmasters fully
bounced), 2 replied (25%, 2 of 8; Padium in 3 days from posting), and 11 addresses emailed: RocketReach 0 of 3 bounced, published 0 of 3, supplied by Albert 1 of 1, and
the rest as Albert confirms (question 10.11).

### 7.3 What's lost or needs Albert

- **Email history comes from Outlook, not memory (Albert, 16 Nov).** Phase 2's first run (`backfill --since
  2026-11-01`) reads Sent Items, the inbox and Junk since 1 Nov. It fills in exact send times and Outlook ids for
  every logged email (by the hidden key from the `.drafted` markers, then by recipient), and puts anything else sent
  to or received from a known target's address or domain into the review list: a Headmasters resend, if there was
  one, any reply or bounce the log missed. Albert confirms each in the desk.
- **The WatchHouse heads-up** went from Albert's personal email, which the drafter can't see, so it comes from the
  log. Nothing has been sent to WatchHouse since (Albert, 16 Nov).
- **Letters (Albert, 16 Nov):** Padium and Hawes & Curtis were both posted on Mon 9 Nov; no reply from Touker
  Suleyman yet. The older-style letters (Charles Tyrwhitt, Mayfair House Group, The Salad Project, Upstairs at
  Langan's) were not posted.
- **Address sources** not recorded: corporate@headmasters.com, the two ukpress@ addresses, marketing@pallmallbarbers.com.
- **Categories and asks** are chosen by Claude from the text and shown for Albert to check before import.
- Nothing in the Markdown is deleted: it is frozen with a line at the top saying the desk is now the record, and any
  text that doesn't fit a column is kept word for word in `notes`.

### 7.4 How the copy runs

Claude turns the log into a JSON file (one entry per target, contacts, touches and outcomes, each with an
`import_key`). It is not committed to git, because it holds names and addresses. Albert uploads it on Desk >
Settings > Import, sees a preview table of everything it will create, and presses Import. A second import of the same
file changes nothing. The import is one audit row (`desk.import`, counts only).

---

## 8. Security and privacy

### 8.1 The owner gate

- `app/admin/require-owner.ts`: `requireOwner()` calls `requireAdmin()` (signed in, an admin, aal2), then reads
  `is_owner` through the service role. Not the owner: a redirect to `/admin/no-access`, a plain page inside the
  console that says "You don't have access to this page." with a link back to the dashboard (Albert, 15 Nov). The
  redirect happens before any desk data is read, so nothing leaks. (Next's own `forbidden()` would do this with a
  403, but it is still experimental and needs a config switch, so the plan doesn't use it.) Cached per request like
  `requireAdmin()`.
- Every desk page and every desk server action calls it (actions are reachable on their own, so the page check is
  not enough).
- The protected layout passes `isOwner` to the admin bar, which shows "Desk" only for the owner. Nothing about the
  desk appears on the admin dashboard or in `queueCounts()`.
- Tables: section 2.7. A non-owner's session gets nothing through the REST API either.

### 8.2 Audit

Every desk action writes one `admin_audit` row through `audit()`: `desk.target.create|update|delete`,
`desk.contact.create|update|delete`, `desk.touch.create|update|delete`, `desk.outcome.create|confirm|update|delete`,
`desk.followup.snooze|skip|pause|resume|stop`, `desk.optout.set|clear`, `desk.import`, `desk.drafter.link|unlink`,
and `desk.drafter.<action>` for the drafter's writes. Details hold ids, field names and counts, never names, email
addresses or message text, so the audit trail is not a second copy of personal data and survives a deletion without
keeping the person.

### 8.3 Opt-out

An "opted out" tick on a person or a whole target. Once set:

- no touch can be added to that address or target (the action refuses with "Opted out on <date>");
- every scheduled follow-up is cancelled;
- the drafter's `check` returns "opted out" and it won't draft an email to that address, from any folder;
- the person stays in the desk, marked, so they are never approached again. That is the reason to keep the record
  (question 10.10).

### 8.4 Deleting a person's record

- **Delete a person:** removes the contact row; clears `address` on their recipient rows and `from_address`,
  `from_name`, `subject` and `preview` on outcomes from them. Touches and outcomes stay without the person (channel,
  dates, mailbox type, source), so the counts don't change. If they asked never to be contacted, the dialog warns that
  deleting removes the opt-out too and offers to keep just the email address on a suppression list (question 10.10).
- **Delete a target:** removes everything about the business.
- The dialog says what goes and that it can't be undone, and reminds Albert that copies outside the desk (Outlook,
  OneDrive files, Outreach_Log) are separate and must be deleted there if the request covers them.
- What we keep: professional, public information plus what people send us, which now includes the full text of every
  email to and from a partner (Albert, 16 Nov). No phone numbers, no home addresses, no personal email addresses that
  people haven't used with us. Deleting a person clears the text of their emails and notes about them.
- The lawful basis (legitimate interests for business-to-business outreach) and PECR's rules for emailing businesses
  are for Albert to confirm; this is not legal advice. The desk supports them with sources, opt-out lines in
  follow-ups and deletion.

### 8.5 What the drafter can and cannot do

| Can | Cannot |
|---|---|
| Read Albert's mailbox (it always could, with Mail.ReadWrite) and send the desk only what matches a target | Send email: no Mail.Send, no `/send`, `/reply`, `/replyAll` or `/forward` in its code, and it refuses a token carrying Mail.Send |
| Create drafts: new ones (as today) and in-thread follow-ups | Use the Supabase service-role key, or reach the database directly |
| Move its own unedited stale follow-up drafts to Deleted Items (if agreed) | Delete or permanently remove any other mail |
| Call the five desk actions in 3.3 with its own key | Delete desk records, change opt-outs, change stages beyond contacted to replied, or read anything else on the site |
| Keep its two secrets in the Keychain (the Microsoft sign-in and the desk key) | Write any key, token or code to a file, the screen or a log |

### 8.6 Hard rules: how the plan keeps them

| Rule | How |
|---|---|
| Nothing ever sends email | no send endpoint, no "send" button anywhere in the desk; tests check the drafter's source for send paths |
| No change to the Entra app, the drafter or its settings without approval | Phase 2's drafter work starts only after Albert approves it; nothing needs Entra |
| No password, code or token in a file or the chat | the desk key is generated and kept in the Keychain; only its fingerprint is pasted |
| UK GDPR | 8.3 and 8.4 |
| Existing stack | Supabase with RLS, `require-admin.ts` (plus `require-owner.ts` on top), `audit()`, Vercel Hobby, the pg_cron pattern if a job is ever needed |
| The drafter runs on the Mac and never has the service-role key | 3.3 |

---

## 9. Phased build plan

The repo's approach throughout: build and test on the local stack, a production build, e2e scripts in
`tests/e2e/phase-b/`, a branch and bundle, then a Claude Code release prompt for Albert. Live migrations only through
Claude Code's Supabase MCP `apply_migration` (or the SQL editor) with Albert approving.

### Phase 1: records, the copy, the blotter, manual logging, Due today

**Files**

- `supabase/migrations/20261117090000_outreach_desk.sql`, `release/undo-outreach-desk.sql`,
  `release/set-desk-owner.sql`
- `app/admin/require-owner.ts`; `app/admin/(protected)/no-access/page.tsx` ("You don't have access to this page.")
- `app/admin/(protected)/layout.tsx` and `components/admin/admin-bar.tsx` (the owner-only Desk link)
- `app/admin/(protected)/desk/page.tsx`, `loading.tsx`, `t/[id]/page.tsx`, `settings/page.tsx` (import only in
  Phase 1)
- `app/admin/desk-actions.ts` (every action: `requireOwner()`, then `audit()`)
- `app/admin/desk.css` (the desk's look, inside the console's tokens)
- `lib/server/outreach/`: `db.ts` (queries), `rules.ts` (working days, bank holidays, due dates), `followups.ts`
  (create, cancel, pause), `kpis.ts`, `import.ts`
- `components/admin/desk/`: `kpi-strip.tsx`, `due-today.tsx`, `blotter.tsx`, `blotter-filters.tsx`, `timeline.tsx`,
  and the forms (`target-form.tsx`, `contact-form.tsx`, `touch-form.tsx`, `letter-form.tsx`, `reply-form.tsx`,
  `delete-dialog.tsx`)
- `app/api/test-hooks/[action]/route.ts`: a `desk` hook for the working-day checks (test only, as today)
- Tests: `tests/e2e/phase-b/24-outreach-desk.mjs`; `00-migration.mjs` and `01-security.mjs` updated;
  `shoot-desk.mjs` (screens at 1440 and 390)
- Docs: Technical Reference Part 22 (Outreach Desk); Decisions_Log entry

**Tests** (in the style of `13-admin.mjs`)

- Refusals on every desk page (normal and RSC requests) and every desk action: no session, an aal1 admin, an aal2
  admin who isn't the owner (a second test admin, "Kira"), a member. Each gets the refusal and nothing changes. The
  non-owner lands on "You don't have access to this page." and sees no Desk link.
- REST: anon, a member and the non-owner admin read nothing from any `outreach_` table or the view.
- The owner flag: at most one owner; no action can change it.
- Logging: target, contact, email touch, letter posted, reply; KPIs, blotter and Due today change as expected.
- Follow-ups: due dates across a weekend and a bank holiday; snooze, skip, pause, resume, stop; a reply cancels;
  an all-bounced sequence pauses; opt-out cancels and refuses a new touch.
- Delete a person: fields cleared, counts unchanged; delete a target: all gone; audit rows hold no names or addresses.
- Import: the preview, then the import, then a second import changes nothing.

**Size:** large. About 3 to 4 working sessions; roughly 3,000 lines with tests.

**How Albert verifies**

1. Run the release prompt in Claude Code (merge, migration with his approval, `set-desk-owner.sql`).
2. Open `/admin/desk`: the KPIs read about "Response 25% (2 of 8)", and five rows match the log.
3. Ask Kira to open `/admin/desk`: "You don't have access to this page.", and no Desk link.
4. Add a "Test Bakery" target, log an email, see FU1 in Due today 5 working days later (snooze it to today to see it),
   log a reply, watch the KPIs move; mark it opted out and try to add a touch (refused); then delete it.

### Phase 2: the drafter syncs sends, replies and bounces, and drafts follow-ups

Starts only after Albert approves the drafter change.

**Step 1, a spike (half a session, read-only apart from one test draft):** on the Mac, with Albert, using test
emails to himself and to a made-up address at clubyuppie.com (for a bounce): check that the hidden key survives
sending, what Exchange's bounce looks like (message class, conversation id, the failed address), and what
`createReplyAll` on a sent message fills in. The plan below is adjusted to what it finds.

**Files**

- `supabase/migrations/20261124090000_outreach_drafter_link.sql`, `release/undo-outreach-drafter-link.sql`
- `app/api/desk/drafter/[action]/route.ts`; `lib/server/outreach/drafter-auth.ts` (fingerprint check, rate limit),
  `sync.ts` (plan and report), `match.ts` (confirm and review rules), `templates.ts`
- `app/admin/(protected)/desk/settings/page.tsx` (link, unlink, templates, drafter health) and the review list
- `tools/outlook-drafter/desk_sync.py` (new, standard library only: the desk client, classification, matching, the
  follow-up drafts) and small hooks in `draft_partner_emails.py` (`desk-link`, `desk-unlink`, `sync`, `backfill
  --since 2026-11-01`, the `check` before drafting, `status` showing the link); optionally `schedule on|off` for a
  15-minute LaunchAgent
- `tools/outlook-drafter/test_draft_partner_emails.py` (and `test_desk_sync.py`): `FakeMicrosoft` extended with Sent
  Items, an inbox, a bounce, an out-of-office, `createReplyAll`; a stand-in desk
- `tools/outlook-drafter/README.md`; Technical Reference Parts 14 and 22
- Skill changes (partner-emails, email-drafts) to write `.desk.json`, proposed for Albert to approve
- `tests/e2e/phase-b/25-outreach-drafter-api.mjs`

**Tests**

- Route: no key, wrong key, revoked key → 401 and nothing written; each action's shape checked; repeats change
  nothing; an opted-out address refused; payload and rate limits; audit rows hold ids and counts only.
- Drafter (Python, stand-in Microsoft and desk): sent found by key, then by conversation; a forward; a reply in the
  thread, in a new thread by sender, by domain (review); a bounce with two recipients; an out-of-office; a calendar
  invitation; Junk; unmatched mail never reported; a follow-up draft has the right recipients, body above the quote,
  no attachment; a failure deletes the half-made draft; the source contains no `/send`, `/reply`, `/replyAll`,
  `/forward` and no `Mail.Send`; the key never appears in output or files.

**Size:** large. Spike plus 3 to 4 sessions; about 1,000 lines of Python and 1,500 of TypeScript and tests.

**How Albert verifies**

1. `draft-partner-emails desk-link`, paste the fingerprint into Desk > Settings; `draft-partner-emails status` says
   "Desk: linked".
2. Ask the desk chat to queue a test email to hello@clubyuppie.com with a `.desk.json`; run `draft-partner-emails`:
   the desk shows it DRAFTED. Send it from Outlook: within a sync it shows SENT with the exact time.
3. Reply from hello@: REPLIED. Send one to a made-up address at clubyuppie.com: BOUNCED with the code. Turn on an
   out-of-office for hello@ and send again: OOF, follow-ups unchanged.
4. Snooze the test follow-up to today: a draft appears in Outlook Drafts, in the thread, addressed to hello@ only. It
   is not sent.
5. Reply again: the follow-up is cancelled and the draft flagged stale.
6. Unlink the drafter: the next run says the desk key was revoked.

### Phase 3: Alex

**Files**

- `supabase/migrations/20261201090000_desk_alex.sql` and `release/undo-desk-alex.sql` (section 0.1)
- `app/api/desk/mcp/route.ts`: the Desk connector, a remote MCP server for Albert's Claude account, with its sign-in
  in `app/api/desk/oauth/[step]/route.ts` and a consent page at `app/admin/(protected)/desk/connect/page.tsx` (owner,
  aal2). Tools: `desk_today`, `desk_partner` (everything about one partner), `desk_search`, `desk_add_note`,
  `desk_add_action`, `desk_due_writing` (what needs writing tonight, with each thread and Alex's guidance) and
  `desk_save_draft_text`. No send, delete or opt-out tools
- `lib/server/outreach/agenda.ts` (builds the day) and `lib/server/outreach/alex-email.ts` (the email; one allowed
  recipient, albert@clubyuppie.com)
- `app/api/cron/[job]/route.ts`: a `desk-agenda` job; `release/schedule-cron.sql` gains `club-yuppie-desk-agenda` at
  05:30 and 06:30 UTC, and the job sends only when it is 06:30 in the UK, once a day, so the clock change doesn't
  matter
- `app/admin/(protected)/desk/today/page.tsx` (the Today page the email links to); settings gain the connector
  (connected, last used, disconnect) and the guidance editor
- The drafter (Phase 2 code) now also turns Alex's saved draft text into in-thread drafts
- Set up with Albert, outside the repo: the "Alex" assistant chat (instructions written by Claude, with the
  connector), the nightly scheduled task (created with his approval), and the alex@clubyuppie.com alias in
  Microsoft 365 (his admin task)

**Tests**

- The connector refuses no token, a revoked token, and a consent attempt by a non-owner or without aal2; each tool's
  shape; no tool can send, delete or change an opt-out.
- The 06:30 email: any recipient other than albert@clubyuppie.com is refused; one email a day; correct across the
  clock change; its content matches a seeded day.
- Draft text flows from `desk_save_draft_text` to an in-thread Outlook draft (with the stand-in Microsoft) with the
  attachment.
- An email containing text aimed at an AI ("ignore your instructions...") produces only a draft text and changes
  nothing else.

**Size:** large. About 3 sessions.

**How Albert verifies:** connect the Desk connector in his Claude settings (admin password and authenticator code);
in the Alex chat, send a photo of meeting notes and see them on the partner's page with their actions; ask "brief me on
Padium"; the next morning at 06:30 the email from Alex arrives with his day; a due follow-up sits in Outlook Drafts, in
the thread, in his voice, with the PDF, unsent.

### Phase 4: charts and breakdowns

**Files**

- `app/admin/(protected)/desk/analytics/page.tsx`
- `lib/server/outreach/metrics.ts` (every measure in section 6, from the view)
- `components/admin/desk/charts/`: `rate-bars.tsx` (A1 to A6), `week-columns.tsx` (A7), `dot-strip.tsx` (A8),
  `funnel.tsx` (A9), `stage-bars.tsx` (A10), `load-bars.tsx` (A11), `sample.tsx` (the "2 of 8" label and the
  small-sample hatching)
- Tests: `tests/e2e/phase-b/26-outreach-analytics.mjs` (a seeded data set with known answers for every chart, the
  "-" for no data, hatching under 5, the window and "settled only"); `shoot-desk.mjs`

**Charts: hand-built SVG, no library.** Each chart is a server component that returns an `<svg>`: no client
JavaScript, nothing added to the bundle, styled by the desk's CSS tokens, sharp at any size, and printable. Hover
details come from SVG `<title>` elements. The alternatives were weighed: Recharts and Chart.js run only in the browser
and add roughly 40 to 100 KB of JavaScript; visx is modular but still client-side; Observable Plot can render on the
server but needs a fake document and extra dependencies. With a few hundred rows and simple bar, dot and funnel
shapes, about 400 lines of our own SVG is less to carry.

**Size:** medium. About 2 sessions.

**How Albert verifies:** open Analytics; check that every chart shows its n; pick two numbers (response rate by
channel, bounce rate for RocketReach) and count them by hand from the blotter's filters.

---

## 10. Risks and open questions

Reply "agree" to take the recommendation, or change it.

1. ~~What does a non-owner see at `/admin/desk`?~~ **Decided (Albert, 15 Nov):** a page saying "You don't have
   access to this page.", and no Desk link.
2. ~~Follow-up timing.~~ **Decided (Albert, 16 Nov):** 7 working days, counted from when the previous email or letter
   actually went out (4.1).
3. ~~Christmas.~~ **Decided (Albert, 15 Nov):** 21 Dec to 1 Jan counts as non-working, so no follow-up falls due
   then.
4. ~~How the drafter writes to the desk.~~ **Decided (Albert, 16 Nov): agreed.** Recommended: option A, a narrow route on the website with its own key
   (3.3), not a Supabase Edge Function or database function.
5. ~~Setting up the key.~~ **Decided (Albert, 16 Nov): agreed.** Recommended: made on the Mac, kept in the Keychain, only its fingerprint pasted into the
   desk; re-link every six months; Unlink in the desk stops it at once.
6. ~~How often the drafter syncs.~~ **Decided (Albert, 16 Nov): agreed.** Recommended: every 15 minutes while the Mac is awake, from a LaunchAgent that
   `draft-partner-emails schedule on` installs (and `off` removes), plus every manual run. macOS may ask once to let
   python3 read the OneDrive folder ("Files and Folders"); that's all it needs, never accessibility or keystrokes.
7. ~~When follow-up drafts appear.~~ **Decided (Albert, 16 Nov):** written the night before the due date, so they
   are ready to review on the morning they go out. How, if the Mac sleeps: question 10.25.
8. ~~Stale follow-up drafts after a reply.~~ **Decided (Albert, 16 Nov): agreed.** Recommended: the drafter moves an unedited one to Deleted Items
   (recoverable); an edited one is left alone and flagged.
9. ~~Phone numbers.~~ **Decided (Albert, 16 Nov):** not stored for now. WhatsApp tracking, when it comes, will need
   them; revisit then.
10. ~~Deleting someone who opted out.~~ **Decided (Albert, 16 Nov):** an edge case, handled by hand; no special
    feature.
11. ~~Address sources.~~ **Decided (Albert, 16 Nov):** where the source wasn't recorded (corporate@headmasters.com,
    both ukpress@ addresses, marketing@pallmallbarbers.com) it is `supplied by Albert`, as is Adam Reynolds'. From now
    on every address records its real source.
12. ~~Categories.~~ **Decided (Albert, 16 Nov):** the list as proposed; Padium is fitness. For exclusivity, Padium's
    category would be defined narrowly ("padel"), so it never blocks 1Rebel or Third Space.
13. ~~Missing history.~~ **Decided (Albert, 16 Nov):** Padium and Hawes & Curtis were both posted on 9 Nov (no reply
    from Touker yet). Email history, including any Headmasters resend, comes from the Outlook backfill (7.3).
14. ~~The WatchHouse heads-up.~~ **Decided (Albert, 16 Nov):** kept on record, left out of the numbers; nothing sent
    since. It came from his personal email, so it's imported from the log, not Outlook.
15. ~~Outreach_Log after the copy.~~ **Decided (Albert, 16 Nov):** the desk becomes the one record of every
    communication with each partner (emails, letters, calls, meetings and their notes, and WhatsApp later). The
    Markdown log stops being updated once the desk is live.
16. ~~Follow-up wording.~~ **Decided (Albert, 16 Nov):** build the flow first; Albert approves the templates after.
    No follow-up draft is made until its template is approved.
17. ~~How much of a reply the desk keeps.~~ **Decided (Albert, 16 Nov): save all communications in full** (see
    10.29 for attachments). The earlier recommendation, kept for the record: When someone replies, the desk can keep the first couple of lines of
    what they wrote (the snippet Outlook shows in the inbox list, up to 255 characters), so the timeline reads
    "Richard Marshall: Thanks Albert, would be good to speak next week..." without opening Outlook. Or it keeps
    nothing but a link to the email. Recommended: keep the snippet for real replies only, never the whole email, and
    nothing from automatic mail.
18. ~~Kira's letters.~~ **Decided (Albert, 16 Nov):** Kira doesn't need letters yet, so no view for her.
Risks 19 to 22: noted and accepted (Albert, 16 Nov).

19. **Risk: the hidden key may not survive sending,** or `createReplyAll` may fill in recipients differently than
    expected. Mitigation: the Phase 2 spike checks both first; the fallbacks (conversation id, explicit recipients)
    are already in the design.
20. **Risk: Almarai may lack tabular figures,** so columns of numbers wobble. Mitigation: checked in Phase 1; the
    system monospace font for number cells if needed.
21. **Risk: the Mac is the only sync point.** If it's off, the desk shows the last sync time and late follow-ups in
    yellow; nothing is lost, it catches up on the next run (the sync reads from the last sync time).
22. **Risk: UK GDPR and PECR.** Mitigation: section 8. Recommended: Albert confirms the lawful basis and the
    business-email rules with a lawyer or the ICO's guidance before outreach grows; this plan is not legal advice.
23. ~~Follow-ups after a letter.~~ **Decided (Albert, 16 Nov):** an email 10 working days after posting (4.1). The
    earlier recommendation, kept for the record: The rules in 4.1 were written for emails.
    Recommended: when a letter is the first touch, follow-up 1 falls 7 working days after posting (2 days for the
    post). If we have an email address for the person or a published one for the business, it's an email draft.
    If not (Touker Suleyman), Due today shows "Follow up by hand" (a call, a LinkedIn message or a second letter) and
    Albert logs what he does. Under this rule Hawes & Curtis would be due Wed 18 Nov.

### Scope added by Albert, 16 Nov (to be written through the plan once 24 to 29 are answered)

- The desk records **every** communication with each partner: emails in full (both directions), letters, calls,
  meetings, meeting notes Albert gives Claude, and WhatsApp later (set up another day).
- It logs every action point (follow-ups, booked calls, meetings) and at **06:30 each day** gives Albert a to-do list
  and agenda for the day.
- It **writes the replies and follow-ups** as drafts, by the rules above. It never sends.
- The partner page is quick to reach and shows everything, so Albert can review a partner before an impromptu
  meeting.

24. ~~After the follow-up.~~ **Decided (Albert, 16 Nov):** one follow-up email only, then nothing until the middle
    of January, when a third email goes out (4.1). The earlier recommendation, kept for the record: for an email-first sequence, a printed letter 7 working days after follow-up 2
    if there is a postal address; for a letter-first sequence, nothing more. Either way the sequence closes as "no
    reply" 15 working days after the last step.
25. ~~The Mac overnight.~~ **Decided (Albert, 16 Nov): agreed.** drafts
    are made from 21:00 the evening before, so they're usually done before the laptop is closed; anything missed is
    made the moment the Mac wakes, and the 06:30 agenda says what's missing. Later, when WhatsApp is added, consider
    moving mail access from the Mac to the website itself (a new Entra app registration with a certificate, for
    Albert to approve; the website would then hold a standing sign-in to the mailbox).
26. ~~How the 06:30 agenda reaches Albert.~~ **Decided (Albert, 16 Nov):** an email to albert@clubyuppie.com with the
    whole agenda written in it, and a link to the desk at the bottom. It comes from the assistant's own address
    (10.32). The earlier recommendation, kept for the record: It's built on the server (a pg_cron job), so it doesn't need the Mac.
    Recommended: the website emails it to albert@clubyuppie.com only, never anyone else, through its existing email
    service, with a link to the desk's Today page. This is the one exception to "nothing sends email", which is about
    partners, so it needs Albert's explicit yes. Alternatives: only the Today page, or a phone notification (not built
    for admins yet).
27. ~~Who writes the replies and follow-ups.~~ **Decided (Albert, 16 Nov):** Albert's own Claude account writes them,
    not the Anthropic account Concierge uses. How: question 10.30. The rejected recommendation, kept for the record:
    overnight, the website asks Claude, through the Anthropic account Concierge already uses, to draft each reply and follow-up from the partner's history and Albert's writing
    rules; the drafter puts them into the Outlook thread as drafts. This sends partners' email text to Anthropic for
    processing. Alternative: the desk chat writes them when Albert asks.
28. ~~Meeting notes.~~ **Decided (Albert, 16 Nov):** a dedicated assistant chat in Albert's Claude account. He
    uploads photos of notes or types things up; it sorts them and puts them on the partner's page with their action
    points. How it reaches the desk: question 10.30. The earlier recommendation, kept for the record: Albert gives Claude the notes (typed, or a photo like the Pall Mall Barbers notes
    of 16 Nov); Claude saves them to a OneDrive folder ("Desk inbox") and the drafter files them on the partner's page
    with their action points. Albert can also type notes straight onto the partner page.
29. ~~Attachments.~~ **Decided (Albert, 16 Nov):** every email's full text is saved in the desk; attachments stay
    in Outlook, with their names and a link on the partner's page. Every follow-up carries the attachment too: the
    drafter copies the first email's PDF onto the follow-up draft. A follow-up after a letter has no earlier PDF, so
    the desk asks for the partner's overview PDF two working days before it's due.

Notes, not questions: calls and meetings that arrive as invitations in the mailbox (such as Desh's for Padium) are
read with the existing permission; reading Albert's whole calendar would need `Calendars.Read`, an Entra change, and
isn't planned.

### Added by Albert, 16 Nov: the desk as his executive assistant

The desk acts as Albert's EA, with a human name and its own email address that writes only to
albert@clubyuppie.com (the 06:30 agenda, and anything else it needs to tell him). The website's email service
already sends from noreply@clubyuppie.com, so a second address on the same domain needs no new mailbox; the code
allows exactly one recipient, albert@clubyuppie.com, so it can never write to a partner.

30. ~~How Albert's Claude account reaches the desk.~~ **Decided (Albert, 16 Nov): agreed** (the Desk connector). A website can't use a claude.ai account directly. The way to
    use Albert's account is for Claude, working in his account, to do the writing and hand it to the desk.
    Recommended: a **Desk connector** on the website, added to Albert's Claude account in its connector settings.
    Albert connects it once by signing in to the admin with his password and authenticator code. It is the one door
    through which:
    - the assistant chat files meeting notes, action points and anything he types up, from his phone or laptop, and
      answers questions such as "brief me on Pall Mall Barbers";
    - a nightly scheduled task in his account (about 21:30) reads what is due tomorrow, writes each reply and
      follow-up in his voice, and saves the text in the desk; the drafter then puts it into the Outlook thread.
    The connector can read the desk, add notes, actions and draft text, and nothing else: it can't send, delete,
    change an opt-out, or touch anything outside the desk. It is revocable from the desk at any time. It runs on
    Albert's Claude plan's usage. Alternative: Claude Code on the Mac writes the drafts each night, and the assistant
    chat saves notes to a OneDrive folder for the drafter to file. That needs no new website surface, but it works
    only when the Mac is on, so notes from a phone would wait.
31. ~~The assistant's name.~~ **Decided (Albert, 16 Nov): Alex.**
32. ~~The assistant's email address.~~ **Decided (Albert, 16 Nov):** "Alex at Yuppie" <alex@clubyuppie.com>, sent through
    the website's existing email service. Replies to her go to albert@clubyuppie.com (an alias Albert adds in
    Microsoft 365 admin, free, no licence), so nothing is lost if he replies by mistake.
33. ~~The January round.~~ **Decided (Albert, 16 Nov): agreed.** the January emails go out across the week of Mon 11 Jan 2027, a few each
    morning rather than all at once, so replies arrive at a pace Albert can handle. Each is drafted the night
    before, like any follow-up.

Risk to note: the nightly writer reads partners' emails, and an email could contain text aimed at an AI ("ignore your
instructions..."). Mitigation: the connector has no send, delete or opt-out tools, every draft waits for Albert, and
the writer is told to treat email text as information, never as instructions.
