// The three Supabase templates through a real Supabase Auth server.
//
//   node tests/e2e/phase-a/emails/auth-templates-live.mjs http://127.0.0.1:9998
//
// The Auth server given must load its templates from this worktree's
// supabase/templates/ (GOTRUE_MAILER_TEMPLATES_* pointing at them) and send
// to the stack's SMTP catcher. The stack's own Auth (:9999) reads them from
// TEMPLATES_REPO (default /home/claude/co) through the gateway, so after a
// merge it can be used too: http://127.0.0.1:9999.
// Needs `source /home/claude/stack/app.env` (the service key confirms the test user).
//
// It sends a login code, logs in with it the way stack/tools/login.mjs reads
// it, changes the login email (the email change code goes out), and asks for
// a password reset, then checks each mail: subject, sender, the code as text,
// the reset link, no placeholder left, and what Auth did to the html.
import fs from 'node:fs';
import path from 'node:path';

const AUTH = process.argv[2] || 'http://127.0.0.1:9998';
const BOX = '/home/claude/stack/mail/box';
const GATEWAY = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SECRET_KEY;
if (!GATEWAY || !SERVICE) throw new Error('source /home/claude/stack/app.env first');
const EMAIL = 'e.authmail@example.com';
const NEW_EMAIL = 'e.authmail.new@example.com';
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); else console.log('  ok ' + what); };

async function json(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function decodeQP(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  let body = rest.join('\n\n');
  if (/quoted-printable/i.test(head)) {
    body = body.replace(/=\r?\n/g, '');
    body = Buffer.from(body.replace(/=([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  }
  return { head, body, raw };
}
// Found by the template's <title> (always the designed subject); the Subject header is checked on its own,
// because it comes from config.toml (GOTRUE_MAILER_SUBJECTS_*), which a local Auth may not set.
async function waitMail(to, subject, since) {
  for (let i = 0; i < 50; i++) {
    const files = ['new', 'cur'].flatMap((d) => (fs.existsSync(path.join(BOX, d)) ? fs.readdirSync(path.join(BOX, d)).map((f) => path.join(BOX, d, f)) : []));
    const hit = files
      .map((f) => ({ f, m: fs.statSync(f).mtimeMs }))
      .filter((x) => x.m >= since)
      .sort((a, b) => b.m - a.m)
      .map((x) => fs.readFileSync(x.f, 'utf8'))
      .map(decodeQP)
      .find((t) => t.head.toLowerCase().includes(`to: ${to.toLowerCase()}`) && t.body.includes(`<title>${subject}</title>`));
    if (hit) {
      check(hit.head.includes(`Subject: ${subject}`), `subject header "${subject}" (${(hit.head.match(/^Subject: (.*)$/m) || [])[1]})`);
      return hit;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// A confirmed user (admin API through the stack gateway; same database).
let users = await json(`${GATEWAY}/auth/v1/admin/users?per_page=1000`, { headers: admin });
for (const u of users.body.users.filter((x) => [EMAIL, NEW_EMAIL].includes(x.email))) {
  await json(`${GATEWAY}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: admin });
}
const created = await json(`${GATEWAY}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email: EMAIL, email_confirm: true }) });
check(created.status === 200, `test user created (${created.status})`);

// 1. Login code (Magic Link template).
let since = Date.now() - 500;
const otp = await json(`${AUTH}/otp`, { method: 'POST', body: JSON.stringify({ email: EMAIL, create_user: false }) });
check(otp.status === 200, `login code requested (${otp.status})`);
const login = await waitMail(EMAIL, 'Your Club Yuppie login code', since);
check(Boolean(login), 'login code mail arrived');
let session = null;
if (login) {
  check(/From: "Club Yuppie" <noreply@clubyuppie\.com>/.test(login.head), 'sender is Club Yuppie <noreply@clubyuppie.com>');
  // stack/tools/login.mjs: the first six-digit word of the raw mail, soft breaks removed.
  const code = (login.raw.replace(/=\r?\n/g, '').match(/\b(\d{6})\b/) || [])[1];
  check(new RegExp(`<div class="code t-card"[^>]*>${code}</div>`).test(login.body), `the code ${code} is the text of the code card`);
  check(login.body.includes(`We sent this to ${EMAIL} because someone asked to log in to Club Yuppie.`), 'footer names the address');
  check(login.body.includes('expires in 10 minutes'), 'says 10 minutes');
  check(!/\{\{/.test(login.body) && !/href="[^"]*verify/.test(login.body), 'no placeholder left and no login link');
  check(!login.body.includes('<!--'), 'Auth stripped the html comments (html/template), as expected');
  const v = await json(`${AUTH}/verify`, { method: 'POST', body: JSON.stringify({ type: 'email', email: EMAIL, token: code }) });
  check(v.status === 200 && v.body.access_token, `the code logs in (${v.status})`);
  session = v.body?.access_token;
}

// 2. Email change code (Change Email Address template), to the new address.
if (session) {
  since = Date.now() - 500;
  const ch = await json(`${AUTH}/user`, { method: 'PUT', headers: { Authorization: `Bearer ${session}` }, body: JSON.stringify({ email: NEW_EMAIL }) });
  check(ch.status === 200, `email change requested (${ch.status})`);
  const mail = await waitMail(NEW_EMAIL, 'Confirm your new Club Yuppie email', since);
  check(Boolean(mail), 'email change mail arrived at the new address');
  if (mail) {
    check(/<div class="code t-card"[^>]*>\d{6}<\/div>/.test(mail.body), 'the code is the text of the code card');
    check(mail.body.includes(`>${EMAIL}</span>`) && mail.body.includes(`>${NEW_EMAIL}</span>`), 'From and To rows show both addresses');
    check(!/\{\{/.test(mail.body), 'no placeholder left');
  }
}

// 3. Admin password reset (Reset Password template).
since = Date.now() - 500;
// The change waits for its code, so the account is still on the first address.
// Auth spaces emails to one user (GOTRUE_SMTP_MAX_FREQUENCY): wait and retry on a 429.
let rec;
for (let i = 0; i < 8; i++) {
  rec = await json(`${AUTH}/recover`, { method: 'POST', body: JSON.stringify({ email: EMAIL }) });
  if (rec.status !== 429) break;
  await new Promise((r) => setTimeout(r, 1500));
}
check(rec.status === 200, `reset requested (${rec.status})`);
const reset = await waitMail(EMAIL, 'Reset your Club Yuppie admin password', since);
check(Boolean(reset), 'reset mail arrived');
if (reset) {
  const links = [...reset.body.matchAll(/href="([^"]*reset-confirm[^"]*)"/g)].map((m) => m[1]);
  check(links.length === 1 && /\/admin\/reset-confirm\?token_hash=[0-9a-z_]+&amp;type=recovery$/.test(links[0]), `one reset link to /admin/reset-confirm?token_hash=…&type=recovery (${links[0]})`);
  check(!/class="btn[^"]*" style="[^"]*mso-hide:all/.test(reset.body), 'the reset button is not hidden from Outlook');
  check(!/\{\{/.test(reset.body), 'no placeholder left');
}

// Tidy up the test users.
users = await json(`${GATEWAY}/auth/v1/admin/users?per_page=1000`, { headers: admin });
for (const u of users.body.users.filter((x) => [EMAIL, NEW_EMAIL].includes(x.email) || x.new_email === NEW_EMAIL)) {
  await json(`${GATEWAY}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: admin });
}
console.log(failures.length ? `${failures.length} failed:\n  ${failures.join('\n  ')}` : 'auth templates: all checks passed');
if (failures.length) process.exitCode = 1;
