# The local test copy

Albert, 19 Nov 2026: "from now on we need to test locally prior to pushing". He chose a test copy on his Mac.

Every change now goes through these steps before anything is pushed:

1. The full tests run on the Mac, in the copy.
2. Albert tries the change on http://localhost:3241.
3. Only then does Claude Code push the change and release it.

## What it is

The copy is one Docker container on the Mac (it needs Docker Desktop). It holds the same test set-up the cloud tests use (the ops chat's sandbox):

- **Its own database.** Postgres 16, with Supabase Auth, PostgREST and a small gateway standing in for Supabase.
- **An email catcher.**
- **Stand-ins for outside services.** Stripe, Resend, Twilio, Anthropic and Apple's push service, reached only inside the container.
- **Made-up data only.** The test members, and six invented businesses on the Outreach Desk (`demo-desk.mjs`).

The copy never touches the live site, the live database or any real service:

- It holds no real keys. Its secrets are made inside it at set-up.
- Only this Mac can open it. Ports 3241 and 54321 are on 127.0.0.1 only.

The code goes in as a copy of the branch checked out (the files git tracks). Nothing is mounted, so the Mac's own `node_modules` and `.next` are untouched.

## Commands (from the repo folder on the Mac)

| Command | What it does |
| --- | --- |
| `tests/local/local-test.sh up` | First time, or after a reset. Builds the machine (10 to 20 minutes the first time), sets up its database, then does everything `refresh` does. Stops if the disk has less than 15 GB free. |
| `tests/local/local-test.sh refresh` | For each new change. Copies in the code as it is now and installs packages when `package-lock.json` changed. Gives a fresh database: the baseline, then every migration in `supabase/migrations`. Then the test people, a production build of the site (with the test switches), and the made-up desk. Prints how to log in. |
| `tests/local/local-test.sh test` | The full phase B tests, about an hour. `test 24 28` runs only those scripts. Ends with a summary: `N passed, N failed`. |
| `tests/local/local-test.sh login` | How to log in to the copy. |
| `tests/local/local-test.sh code` | The 6-digit authenticator code for the local Albert. `code dk.` gives the local Kira's. |
| `tests/local/local-test.sh stop` | Stops the copy and keeps it. `refresh` starts it again. |
| `tests/local/local-test.sh reset` | Deletes the copy and its data. |

## Logging in

Open http://localhost:3241/admin/login.

| Who | Log in |
| --- | --- |
| Albert, AC, the owner | `bf.admin@example.com` |
| Kira, KW, on the desk | `dk.admin@example.com` |

- **Password:** `local-admin-password-1` for both. It is a test-only password and exists only in the copy.
- **Code:** run `local-test.sh code`, or `local-test.sh code dk.` for Kira. You don't scan anything.

## Release order (for Claude Code)

1. Check the branch out from the bundle.
2. Run `local-test.sh refresh`, then `local-test.sh test`. Report the summary, and any failure with its first lines.
3. Albert tries the change on localhost.
4. On his go, the release prompt's live steps: the migration, then push and merge.

If a test fails in the copy but passed in the cloud, report it rather than changing the code. The copy's own scripts in `tests/local/` may be fixed if the copy itself is what broke, for example a download address; say what changed.

## Files

- `Dockerfile`: the machine (Ubuntu 24.04, Postgres 16, Supabase Auth 2.177.0, PostgREST 12.2.3, Node 22, aiosmtpd, Playwright's Chromium).
- `local-test.sh`: the Mac side.
- `inside.sh`: the container side.
- `stack/`: the cloud stack's own scripts, as the tests expect them at `/home/claude/stack`.
  - `setup.sh` builds the stack from nothing.
  - `start.sh`, `stop.sh` and `up.sh` run it.
  - `gateway.mjs` and `fakes.mjs` are the stand-ins.
  - `init.sql` and `baseline.sql` are the database before our migrations.
  - `tools/` holds the seed and log-in helpers.
- `demo-desk.mjs`: the made-up desk.

The cloud sandbox uses the same files. When the stack changes there, copy the change here too.
