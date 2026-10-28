# Live migration notes: `20261028090000_members_core_backend.sql` (and the fix round's 090100, 090200)

Three migration files, applied together, bring the live database (project `tbcpzmzfxtbaumlcnmdf`) to what the
Phase A code needs: the core file below, then the fix round's `20261028090100_backend_fixes.sql` (refund
retries; the "Anyone can apply" policy goes) and `20261028090200_admin_fixes.sql` (the admin fixer's; read its
own header). Nothing is applied live yet. The release order, with QA3's release checklist, is in
**Release order (fix round)** at the end; it replaces the shorter "Order" section.
Checked against the live layout read on 27 Oct 2026 (`live-schema/supabase-layout-2026-10-27.md`).

## How it was proved

- The local stack's `baseline.sql` was rewritten from the live dump. Baseline plus the 16 earlier repo
  migrations now gives the live layout exactly: every table, column type, nullability and default, every
  constraint, public index, policy (duplicates included), enum, trigger, function and grant.
  `tests/e2e/phase-a/live-layout-check.mjs` compares the two (40 checks; it rebuilds the database).
- On that layout the Phase A migration applies, and applies again on top of itself
  (`tests/e2e/phase-a/00-migration.mjs`), and every Phase A script passes on it (`run-all.mjs`).
- `release/undo-members-core-backend.sql` takes the migrated database back to the live layout exactly
  (the same 40-check comparison), and works with booking rows present.

## What is different on live from the local stack

Nothing in the layout. What differs:

1. **Data.** Live has 4 members (all active), 2 bookings (both confirmed), 4 events, 5 applications, 3 invites.
   The migration's data-dependent steps all pass on that: the booking status check validates (no
   `waitlisted` rows), the new unique indexes build (no member has two confirmed bookings for one event, no
   payment intent is on two bookings), and new NOT NULL columns have defaults.
2. **The RLS event trigger's name.** The dump gives the function `rls_auto_enable()` but not the trigger's
   name; locally it is `ensure_rls`. It fires on the migration's CREATE TABLEs and enables RLS, which the
   migration also does itself. No effect.
3. **Who runs it.** Run it as `postgres` (the SQL editor's role, the owner of the dashboard-made tables):
   dropping policies, creating triggers and changing grants need the owner.
4. **No migration history on live** (`supabase_migrations` is empty). Do not use `supabase db push`: it would
   try all 17 files, and several older ones are not re-runnable. Apply this one file by hand (below). If you
   want the history right afterwards, `supabase migration repair --status applied <version>` for each of the
   17 versions.

## What the migration changes on live (behaviour)

- **Policies on `members` and `bookings` replaced.** Dropped (every live name): "Members can update their own
  row", "Members can view their own row", "Members read own profile", "Members update own profile" (UPDATE
  with no WITH CHECK), "Members can insert their own bookings", "Members create own bookings", "Members can
  view their own bookings", "Members read own bookings", "Members cancel own bookings" (an UPDATE that let a
  member change any column of their own booking). Made: "Members read self", "Members update self" (with
  check) and "Members read own bookings". No admin policy (live has none on these tables).
- **Grants.** Live gives anon and authenticated every privilege on every table. On `members`: INSERT, UPDATE
  and DELETE revoked, UPDATE granted back only on `full_name, phone, employer, role_title, bio, avatar_url`.
  On `bookings`: INSERT, UPDATE and DELETE revoked. SELECT stays (RLS limits it to the member's own rows).
  The new tables are server-only (anon gets nothing; authenticated only SELECT under an admin policy).
- **`approve_application_and_create_member`**: EXECUTE revoked from PUBLIC, anon and authenticated (Supabase's
  default privileges grant it to anon and authenticated by name; RLS stopped harm, this closes it).
- **`events.tier`**: NOT NULL dropped (no default). Live has it NOT NULL with no default and the admin's
  Create event never sets it, so creating an event in the admin fails on live today. The four events keep
  their tier.
- **`bookings`**: the unique constraint `bookings_member_id_event_id_key` is dropped (found by its columns) and
  replaced by a unique index on (member_id, event_id) for confirmed bookings only, plus one on
  stripe_payment_intent_id. Status may only be `confirmed` or `cancelled` (the enum's `waitlisted` is unused).
- New columns on members, events, bookings and applications; new tables `event_addresses`, `message_log`,
  `stripe_events`, `admin_audit`; the `book_event` function (service role only); `updated_at` triggers.

Two live facts that stay as they are (not this migration's to change): `admin_users` has RLS on and no
policy, so no "admins can ..." policy anywhere passes for a REST caller (the app's admin pages use the
service role, which is unaffected); and `partner_perks` has no member read policy (members read it through
the service role).

## Order

1. **Back up.** Note the time for point-in-time recovery, or take a backup in the dashboard. Export what the
   undo would lose if it is ever needed (nothing yet, before the release).
2. **Apply the migration**, in the SQL editor (paste the whole file and run it) or:
   `psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261028090000_members_core_backend.sql`.
   It runs in a few seconds (four small tables).
3. **Deploy the release straight away.** Not before the migration: the new code reads the new members
   columns, so without them every member would be sent to the login page. Between steps 2 and 3 the old code
   keeps working except free-event booking (it inserts with the member's own client, which the migration
   stops), which shows its "try again" message. Do 2 and 3 back to back, at a quiet time.
4. **Stripe**: `release/stripe-setup.md` (webhook events, portal configuration,
   `STRIPE_PORTAL_CONFIGURATION_ID`).
5. **Scheduled jobs**: `GET https://clubyuppie.com/api/cron/reminders` and `/api/cron/memberships` every 15
   minutes with `Authorization: Bearer $CRON_SECRET` (CRON_SECRET is already in production).
6. **Environment**: optional `ADMIN_ALERTS_EMAIL` (default hello@clubyuppie.com). `MEMBERS_TEST_HOOKS` must not
   be set (the test route answers 404 on production regardless).

## Check after applying

```sql
-- new columns and tables exist
select table_name, count(*) from information_schema.columns
 where table_schema = 'public' and table_name in ('members','events','bookings','applications','event_addresses','message_log','stripe_events','admin_audit')
 group by 1 order by 1;
-- expect: admin_audit 7, applications 17, bookings 17, event_addresses 3, events 19, members 22, message_log 13, stripe_events 5
-- (bookings 19 once 20261028090100 is applied too: refund_attempts, refund_attempted_at; the admin fixes add their own)

-- policies on members and bookings: exactly these three
select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('members','bookings') order by 1, 2;
-- expect: bookings "Members read own bookings" SELECT; members "Members read self" SELECT, "Members update self" UPDATE

-- members: authenticated may update only the profile columns; bookings: no member writes
select column_name from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'members' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by 1;
-- expect: avatar_url, bio, employer, full_name, phone, role_title
select table_name, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('members','bookings') and grantee in ('anon','authenticated')
   and privilege_type in ('INSERT','UPDATE','DELETE');
-- expect: no rows

-- the unique rules on bookings
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'bookings' order by 1;
-- expect bookings_one_confirmed_per_member_event (... WHERE status = 'confirmed') and
-- bookings_stripe_payment_intent_unique; no bookings_member_id_event_id_key

-- events.tier optional, the existing rows untouched
select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'tier'; -- YES
select count(*) from events where tier is null; -- 0 until the admin creates an event

-- the functions are server only
select routine_name, grantee from information_schema.routine_privileges
 where routine_schema = 'public' and routine_name in ('book_event','approve_application_and_create_member') order by 1, 2;
-- expect only postgres and service_role

-- the data is as before
select (select count(*) from members) as members, (select count(*) from bookings) as bookings,
       (select count(*) from bookings where status = 'confirmed' and amount_pence = 0 and refund_status = 'none') as plain_bookings;
-- expect 4, 2, 2 (the two existing bookings get amount_pence 0: the old code did not store the amount)
```

And from the outside: with a member's own token, `PATCH /rest/v1/members?id=eq.<their id>` with
`{"membership_status":"cancelled"}` answers 403, and `POST /rest/v1/bookings` answers 403
(`tests/e2e/phase-a/01-security.mjs` does exactly this locally).

## Undo

`release/undo-members-core-backend.sql` returns the layout to the live dump exactly (proved locally). It
deletes data: the four new tables and every new column (cancel dates, refunds, reminders, exact addresses,
the message and audit logs), and, to restore the old unique rule, a member's cancelled booking rows where
they booked the same event again. It keeps `approve_application_and_create_member` server-only and leaves
`events.tier` optional if an event without a tier exists by then.

1. Export first, for example in the SQL editor:
   `select * from message_log;`, `select * from admin_audit;`, `select * from event_addresses;`,
   `select id, cancel_at, payment_failed_at, grace_until, ended_at, ended_reason, deleted_at from members;`,
   `select * from bookings;` (download each as CSV).
2. Redeploy the previous release first (this code needs the new columns; the previous code works on either).
3. Run the undo file as `postgres`, as one transaction (it has its own `begin` and `commit`).

## The fix round's migration: `20261028090100_backend_fixes.sql`

- `bookings.refund_attempts integer not null default 0` and `bookings.refund_attempted_at timestamptz`, a check
  (attempts >= 0) and a partial index for the refunds job. A refund Stripe did not answer stays `pending`
  without a `stripe_refund_id`; `GET /api/cron/refunds` tries it again with the same idempotency key, three
  tries in all, then `failed` and the club is alerted (QA3-07).
- The live policy **"Anyone can apply"** (INSERT for anon and authenticated, WITH CHECK true) is dropped and the
  INSERT grant on `applications` revoked from anon and authenticated (QA3-12). `/apply` inserts with the service
  role; nothing else inserts applications with a public key (the native app does not). Proved: anon POST
  `/rest/v1/applications` answers 401, and applying through `/apply` still works (`13-fixes-f1.mjs`).
- Proved on a separate database built like live (`baseline.sql`, the 16 earlier migrations, live-like rows:
  QA3's `setup-qa3-db.sh` with another name): the core file and this one apply in one transaction with
  `set lock_timeout = '5s'`, and this one applies again on top of itself.

Check after applying:

```sql
select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'bookings' and column_name in ('refund_attempts', 'refund_attempted_at');
-- expect two rows (integer default 0; timestamp with time zone)
select policyname from pg_policies where schemaname = 'public' and tablename = 'applications' order by 1;
-- expect "Admins can read applications", "Admins can update applications" (no "Anyone can apply")
select grantee from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'applications' and privilege_type = 'INSERT' and grantee in ('anon', 'authenticated');
-- expect no rows
```

## Release order (fix round)

QA3's release checklist, numbered as in its report, folded into one order. Claude Code runs it with the live
keys in the environment (never in a file or a chat).

1. **Back up** (as in "Order" above).
2. **Before the deploy: the Stripe Billing Portal configuration (checklist 6).** Create it
   (`release/stripe-setup.md` section 2) and set `STRIPE_PORTAL_CONFIGURATION_ID=bpc_...` in Vercel production
   *before* the deploy, so Manage and Update card work from the first request (live has no portal
   configuration today; without one every portal session fails).
3. **Before the deploy: Supabase Auth (checklist 5)**, in the Dashboard (Authentication):
   - Email OTP expiry: **600** seconds (C-D5; `supabase/config.toml` `otp_expiry = 600`).
   - Email templates: paste the three files with their subjects: Magic link
     `supabase/templates/magic_link.html`, subject "Your Club Yuppie login code"; Change email address
     `supabase/templates/email_change.html`, subject "Confirm your new Club Yuppie email"; Reset password
     `supabase/templates/recovery.html`, subject "Reset your Club Yuppie admin password".
   - URL configuration: Site URL **https://clubyuppie.com**.
   - Providers, Email: **Secure email change** checked (`double_confirm_changes = true` in config.toml).
4. **Apply the three migrations in one transaction, with a lock timeout (checklist 7)**, as `postgres`:

   ```bash
   ( echo "set lock_timeout = '5s';"; echo "begin;";
     cat supabase/migrations/20261028090000_members_core_backend.sql \
         supabase/migrations/20261028090100_backend_fixes.sql \
         supabase/migrations/20261028090200_admin_fixes.sql;
     echo "commit;" ) | psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1
   ```

   With `ON_ERROR_STOP` any error stops psql before `commit`, so nothing is half applied; a lock it cannot get
   in 5 seconds (a busy table) fails the whole thing cleanly: wait a minute and run it again.
5. **Reconcile the members with Stripe (checklist 2)**, before members use the new pages:
   `node release/reconcile-members.mjs` (dry run; read every line), then
   `node release/reconcile-members.mjs --apply`. Live has 4 active members and 3 active subscriptions: expect
   one "ended" (a cancel made with the old code, whose period ran out) and possibly a "cancel_at" (a cancel
   still running). It reports anything it does not change (a pause that differs).
6. **Deploy** straight after 4 and 5 (the new code reads the new columns).
7. **Backfill the booking amounts (checklist 1)**, after the deploy:
   `node release/backfill-booking-amounts.mjs` (dry run), then `--apply`. The two live bookings were made by the
   old code, which stored no amount: each gets what Stripe received, and any refund already made in Stripe is
   recorded. (The new code reads Stripe for such a booking anyway when it refunds one; the backfill makes the
   admin's lists, the booking card and the emails right.)
8. **Stripe webhook events, after the deploy (checklist 8)**: `release/stripe-setup.md` section 1 (nine events).
9. **Schedule the jobs (checklist 4)**: `psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1 -v cron_secret="$CRON_SECRET" -f
   release/schedule-cron.sql` (pg_cron and pg_net, the secret in Vault; reminders, memberships and refunds every
   15 minutes on different minutes). Then run `GET /api/cron/memberships` once by hand: it cancels and refunds
   the future bookings of anyone step 5 ended (A-D8). Checks are at the end of the file.
10. **Stop the subscription-level default card (checklist 3)**: nothing to run. The code no longer sets one on
    new subscriptions, and the webhook handles members who already have one (`release/stripe-setup.md`).

What was tested locally and what was not: the migrations (above); both scripts against the local stack and the
Stripe fake (`13-fixes-f1.mjs`: dry run, apply, run again); `schedule-cron.sql` on a scratch database with
stand-ins for `cron.schedule`, Vault and `net.http_get` (pg_cron, pg_net and Vault are not available locally):
it runs twice cleanly, makes three jobs with the right schedules, and each job's command, run, asks for the
right URL with a bearer header that the site accepts (200 from each job on a local build). Not tested: the real
pg_cron and pg_net extensions, Vault's encryption, and Supabase Auth's Dashboard settings.
