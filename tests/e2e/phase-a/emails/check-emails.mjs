// Checks for lib/emails, with no server and no browser:
//   node tests/e2e/phase-a/emails/check-emails.mjs
//
//  1. every email and state renders: no "{{", "undefined", "null", "NaN" or
//     "[object" anywhere in the subject, preheader, html or text;
//  2. the design's example content renders byte for byte as the send-ready
//     files (out/r2c-send-*.html|.txt), and the reminder's text part as the
//     round 3 one;
//  3. every value is escaped (hostile values in every string field);
//  4. every link and image is absolute, on NEXT_PUBLIC_SITE_URL or
//     https://clubyuppie.com;
//  5. the copy audit (r2c's rules) passes on the rendered words;
//  6. every text part has the send-ready structure;
//  7. the welcome text and its count; the dark-mode switch;
//  8. the Supabase templates and config.toml.
// Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { loadEmails, REPO } from './load-emails.mjs';

const DESIGN = '/home/claude/rebrand/v4/out';
const V3 = '/home/claude/rebrand/v3/out';
let passed = 0;
const failures = [];
function check(ok, what) {
  if (ok) passed++;
  else failures.push(what);
}

delete process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS;
const emails = await loadEmails();
const { EMAIL_FIXTURES, TEXT_FIXTURES } = await loadEmails('fixtures.ts');
const supabase = await loadEmails('supabase.ts');
const { cancelReasonClause } = await loadEmails('messages.ts');

const unescape = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&zwnj;/g, '‌').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

/** The words a reader sees in the html: text nodes and image alt text, without style, comments or the preheader padding. */
function visibleText(html) {
  const body = html.slice(html.indexOf('<body'));
  const alts = [...body.matchAll(/<img [^>]*alt="([^"]*)"/g)].map((m) => m[1]);
  const text = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '\n');
  return unescape([...alts, text].join('\n')).replace(/[‌]/g, '');
}

const all = [];
for (const name of emails.EMAIL_NAMES) {
  check(EMAIL_FIXTURES[name]?.length > 0, `${name}: has fixtures`);
  check(['member', 'applicant', 'admin'].includes(emails.EMAIL_AUDIENCE[name]), `${name}: has an audience`);
  for (const fx of EMAIL_FIXTURES[name]) all.push({ name, fx, r: emails.renderEmail(name, fx.data) });
}

// ---------------------------------------------------------------- 1. no holes
for (const { name, fx, r } of all) {
  for (const [part, value] of Object.entries(r)) {
    for (const bad of ['{{', 'undefined', 'null', 'NaN', '[object']) {
      check(!value.includes(bad), `${name}/${fx.id}: "${bad}" in the ${part}`);
    }
    check(value.trim().length > 0, `${name}/${fx.id}: empty ${part}`);
  }
  check(r.html.includes(`<title>${r.subject.replace(/&/g, '&amp;')}</title>`), `${name}/${fx.id}: subject is the title`);
}

// ---------------------------------------------------------------- 2. the design, byte for byte
const NOTIF_DRAWN = 'https://clubyuppie.com/members/notifications';
const NOTIF_ROUTE = 'https://clubyuppie.com/members/you/notifications';
for (const name of emails.EMAIL_NAMES) {
  const fx = EMAIL_FIXTURES[name][0];
  check(fx.id === 'design', `${name}: first fixture is the design example`);
  // As drawn: the "Choose what we email you" link on (it follows the Notifications flag in a real send).
  const r = emails.renderEmailWith(name, fx.data, { site: 'https://clubyuppie.com', notificationsLink: true });
  const mine = { html: r.html.replaceAll(NOTIF_ROUTE, NOTIF_DRAWN), text: r.text.replaceAll(NOTIF_ROUTE, NOTIF_DRAWN) };
  if (name === 'event-reminder') {
    const v3 = fs.readFileSync(path.join(V3, 'notif-email-reminder-event.html'), 'utf8');
    const v3text = unescape(v3.match(/<pre>([\s\S]*?)<\/pre>/)[1]);
    check(mine.text === v3text, `event-reminder: text part differs from round 3 notif-email-reminder-event`);
    check(r.subject === 'Tomorrow, 18:30: Padel & Pints' && r.preheader === 'Northgate Courts. Your booking is below.', 'event-reminder: subject and preheader as round 3');
    continue;
  }
  // The designer wrote the map link's & raw inside the href; ours is &amp; (the same URL).
  const html = fs.readFileSync(path.join(DESIGN, `r2c-send-${name}.html`), 'utf8').replaceAll('api=1&query=', 'api=1&amp;query=');
  const text = fs.readFileSync(path.join(DESIGN, `r2c-send-${name}.txt`), 'utf8');
  check(mine.html === html, `${name}: html differs from r2c-send-${name}.html`);
  check(mine.text === text, `${name}: text differs from r2c-send-${name}.txt`);
}
// The 2-hour reminder: only the subject, headline and first line change (v3 notif-board-text).
{
  const two = emails.renderEmail('event-reminder', EMAIL_FIXTURES['event-reminder'][1].data);
  check(two.subject === 'In 2 hours, 18:30: Padel & Pints', 'event-reminder 2h: subject');
  check(two.text.startsWith('In 2 hours. See you there.\n\nPadel & Pints starts at 18:30. Here’s the address.\n'), 'event-reminder 2h: headline and first line');
}

// The review reasons added for the foundation (same layout, plain words).
{
  const fx = Object.fromEntries(EMAIL_FIXTURES['admin-booking-review'].map((f) => [f.id, f.data]));
  const rf = emails.renderEmail('admin-booking-review', fx['refund-failed']);
  check(rf.subject === 'Booking needs review: refund failed', 'review refund_failed: subject');
  check(rf.text.includes('Sam Taylor’s booking on Padel & Pints is cancelled, but Stripe refused the £25 refund. Refund it by hand in Stripe.'), 'review refund_failed: says what happened and what to do');
  check(rf.text.includes('Reason: Refund failed\nError: This charge has already been refunded.\nAmount: £25\nBooking: 7c1e9b52-3f0a-4d8e-9a61-2b5f0c8d4e17\nPayment: pi_3Qx7Ab2eZvKYlo2C0d4f2a9c\n'), 'review refund_failed: Error and Booking rows');
  const pn = emails.renderEmail('admin-booking-review', fx['paid-not-booked']);
  check(pn.subject === 'Booking needs review: paid, not booked', 'review paid_not_booked: subject');
  check(pn.text.includes('Book them in by hand, or refund the payment in Stripe.') && pn.text.includes('Why: The event was cancelled before the payment went through.\n'), 'review paid_not_booked: why and what to do');
  check(!pn.text.includes('Booking: '), 'review paid_not_booked: no Booking row without an id');
  const bare = emails.renderEmail('admin-booking-review', fx['refund-failed-bare']);
  check(!bare.text.includes('Error:') && !bare.text.includes('Booking:'), 'review refund_failed: rows left out without detail or booking id');
  for (const r of [rf, pn]) check(r.html.includes('href="https://dashboard.stripe.com/payments/pi_3Qx7Ab2eZvKYlo2C0d4f2a9c"') && r.html.includes('href="https://clubyuppie.com/admin/members"'), 'review: Stripe and member links');
}

// ---------------------------------------------------------------- 3. escaping
const EVIL = ` <b onclick="x">&'"</b>`;
function poison(value, key = '') {
  if (typeof value === 'string') return /Url$/.test(key) ? value + '?q=<i>"' : value + EVIL;
  if (Array.isArray(value)) return value.map((v) => poison(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poison(v, k)]));
  return value;
}
for (const name of emails.EMAIL_NAMES) {
  for (const fx of EMAIL_FIXTURES[name]) {
    const data = poison(fx.data);
    // Fixed-word fields (enums) are not poisoned.
    for (const k of ['reason', 'moved', 'window']) if (k in fx.data && typeof fx.data[k] === 'string' && !(name === 'event-cancelled' && k === 'reason')) data[k] = fx.data[k];
    const r = emails.renderEmail(name, data);
    check(!/<b[ >]|<i>|onclick="x"/.test(r.html), `${name}/${fx.id}: an inserted value reached the html unescaped`);
    const hasText = JSON.stringify(Object.values(fx.data)).match(/"[^"]/);
    check(!hasText || r.html.includes('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&quot;&lt;/b&gt;'), `${name}/${fx.id}: escaped value not found in the html`);
    check(!/href="[^"]*"[^ >]/.test(r.html.replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, '')), `${name}/${fx.id}: an href attribute was broken out of`);
  }
}
check(cancelReasonClause(' Because the courts are closed that evening. ') === 'the courts are closed that evening', 'event-cancelled: reason clause is trimmed');

// ---------------------------------------------------------------- 4. links absolute
function linksOf(html) {
  return [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => unescape(m[1]));
}
for (const { name, fx, r } of all) {
  for (const url of linksOf(r.html)) {
    if (url.startsWith('https://fonts.googleapis.com/')) continue;
    check(/^(https:\/\/clubyuppie\.com(\/|$)|mailto:hello@clubyuppie\.com$|https:\/\/www\.google\.com\/maps\/search\/|https:\/\/dashboard\.stripe\.com\/)/.test(url), `${name}/${fx.id}: link not absolute on the site: ${url}`);
  }
  for (const url of r.text.match(/https?:\/\/\S+/g) ?? []) check(/^https:\/\/(clubyuppie\.com|www\.google\.com|dashboard\.stripe\.com)\//.test(url), `${name}/${fx.id}: text link ${url}`);
  check((r.html.match(/<img /g) ?? []).every(() => true) && linksOf(r.html).filter((u) => /\.png$/.test(u)).every((u) => u.startsWith('https://clubyuppie.com/email/')), `${name}/${fx.id}: images on https://clubyuppie.com/email/`);
  for (const u of linksOf(r.html).filter((x) => x.includes('/email/'))) {
    check(fs.existsSync(path.join(REPO, 'public', new URL(u).pathname)), `${name}/${fx.id}: image missing from public/: ${u}`);
  }
}
{
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3101/';
  const r = emails.renderEmail('booking-confirmed', EMAIL_FIXTURES['booking-confirmed'][0].data);
  const urls = linksOf(r.html).filter((u) => !/fonts\.googleapis|google\.com\/maps|^mailto:/.test(u));
  check(urls.length > 5 && urls.every((u) => u.startsWith('http://localhost:3101/') || u === 'http://localhost:3101'), `NEXT_PUBLIC_SITE_URL: links and images follow it (${urls.find((u) => !u.startsWith('http://localhost:3101'))})`);
  check(r.text.includes('See your booking: http://localhost:3101/members/events/padel-and-pints'), 'NEXT_PUBLIC_SITE_URL: text links follow it');
  const abs = emails.renderEmail('approval', { ...EMAIL_FIXTURES.approval[0].data, loginUrl: 'https://example.org/x' });
  check(abs.html.includes('href="https://example.org/x"'), 'an absolute link passes through');
  delete process.env.NEXT_PUBLIC_SITE_URL;
}

// ---------------------------------------------------------------- 5. copy audit (rebrand/v4/build_r2c.py check_text)
const BANNED = ['exclusive', 'elite', 'vip', 'premium', 'luxury', 'invite-only', 'curated', 'unlock', 'seamless', 'journey', 'elevate', 'lonely', 'burnout', 'work-life balance'];
const RULES = [
  ['apostrophe', /['‘`]/],
  ['straight quote', /"/],
  ['em or en dash', /[—–]/],
  ['exclamation mark', /!/],
  ['emoji', /[\u{1F300}-\u{1FAFF}☀-➿⭐✅]/u],
  ['log in/out wording', /\b[Ss]ign[ -]?(?:in|out|on)\b|\b[Ll]og-(?:in|out)\b|\b[Ll]ogout\b|\b[Ll]ogin to\b|\b[Ll]ogon\b|\bsignin\b/],
  ['price wording', /£10\s*(?:\/|per|p\/m|pm|monthly|a mo\b|\/mo)|£10 a month[a-z]|10 pounds/],
  ['time format', /\b(?<![\d:£.])[1-9]:[0-5]\d\b|\b\d{1,2}(?::\d{2})?\s?(?:[ap]\.?m\.?|AM|PM)\b/],
  ['bare Yuppie', /(?<!Club )(?<!Club )\b[Yy]uppie\b/],
  ['London', /London/],
  ['e-mail', /\be-mail\b/i],
  ['banned word', new RegExp(`\\b(?:${BANNED.map((w) => w.replace(/[-]/g, '\\-')).join('|')})\\b`, 'i')],
];
function audit(where, text) {
  for (const [rule, rx] of RULES) {
    const m = text.match(rx);
    check(!m, `copy audit, ${where}: ${rule}: "${m ? text.slice(Math.max(0, m.index - 24), m.index + 24) : ''}"`);
  }
  const t2 = text.replace(/https?:\/\/\S+|\/admin\/\S+|&type=recovery/g, '').replaceAll('Padel & Pints', '');
  check(!t2.includes('&'), `copy audit, ${where}: ampersand outside a name`);
  check(!text.replace('You’re in - welcome to Club Yuppie', '').includes(' - '), `copy audit, ${where}: spaced hyphen`);
  check(!/(?<![\d£])\b\d{1,2}:\d{2}\b/.test(text) || [...text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].every((m) => m[1].length === 2), `copy audit, ${where}: 24-hour times with a leading zero`);
}
for (const { name, fx, r } of all) {
  audit(`${name}/${fx.id} subject`, r.subject);
  audit(`${name}/${fx.id} preheader`, r.preheader);
  audit(`${name}/${fx.id} html`, visibleText(r.html));
  audit(`${name}/${fx.id} text`, r.text);
  if (/£10/.test(r.text)) check(!/£10(?! a month|,|\.| on|$)/m.test(r.text.replace(/your £10|take £10|of £10|£10\b(?=\n)/g, '')), `${name}/${fx.id}: "£10 a month" wording`);
}
for (const t of supabase.SUPABASE_TEMPLATE_NAMES) {
  const r = supabase.renderSupabaseTemplate(t);
  audit(`supabase ${t} subject`, r.subject);
  audit(`supabase ${t} html`, visibleText(r.html).replace(/\{\{ \.\w+ \}\}/g, 'x'));
}

// ---------------------------------------------------------------- 6. text part structure
for (const { name, fx, r } of all) {
  const lines = r.text.split('\n');
  const admin = emails.EMAIL_AUDIENCE[name] === 'admin';
  check(lines[1] === '' && lines[0].length > 0, `${name}/${fx.id}: text starts with the headline and a blank line`);
  check(r.text.endsWith('\n') && !r.text.endsWith('\n\n'), `${name}/${fx.id}: text ends with one new line`);
  check(r.text.includes('\nClub Yuppie: Your social life, sorted.\n'), `${name}/${fx.id}: text has the sign-off`);
  check(admin ? r.text.endsWith('This goes to the admin address.\n') : r.text.endsWith(`${emails.COMPANY_LINE}\n`), `${name}/${fx.id}: text ends with the footer`);
  if (!admin) check(r.text.includes('Read our privacy policy: https://clubyuppie.com/privacy\n'), `${name}/${fx.id}: text has the privacy link`);
  check(!/<[a-z/][^>]*>|&(amp|nbsp|lt|gt|quot|#39|zwnj);| /.test(r.text), `${name}/${fx.id}: text has html or entities`);
  check(!/\n\n\n/.test(r.text), `${name}/${fx.id}: text has a double blank line`);
  for (const l of lines) check(!/^\s|\s$/.test(l), `${name}/${fx.id}: text line with stray spaces: "${l}"`);
}

// ---------------------------------------------------------------- 7. texts and dark mode
for (const name of emails.TEXT_NAMES) for (const fx of TEXT_FIXTURES[name]) audit(`text ${name}`, emails.renderText(name, fx.data));
{
  const body = emails.renderText('welcome', {});
  check(body === 'Club Yuppie: You’re in. Log in: clubyuppie.com/member-login', `welcome text: ${body}`);
  const c = emails.smsCount(body);
  check(c.characters === 59 && c.encoding === 'Unicode' && c.parts === 1, `welcome text count ${JSON.stringify(c)}`);
  check(emails.smsCount('Club Yuppie: Padel & Pints starts in 2 hours, 18:30, Northgate Courts. See your booking: clubyuppie.com/members').characters === 111, 'sms counter agrees with round 3 (111)');
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3101';
  check(emails.renderText('welcome', {}) === 'Club Yuppie: You’re in. Log in: localhost:3101/member-login', 'welcome text follows NEXT_PUBLIC_SITE_URL');
  delete process.env.NEXT_PUBLIC_SITE_URL;
}
{
  check(emails.EMAIL_COLOR_SCHEME === 'designed', 'C-D1 B is the default');
  const fx = EMAIL_FIXTURES['payment-failed'][0].data;
  const b = emails.renderEmail('payment-failed', fx).html;
  const a = emails.renderEmailWith('payment-failed', fx, { scheme: 'light' }).html;
  check(b.includes('<meta name="color-scheme" content="light dark">') && b.includes('DESIGNED DARK'), 'designed dark in the default');
  check(a.includes('<meta name="color-scheme" content="light only">') && a.includes('FORCED LIGHT') && !a.includes('DESIGNED DARK'), 'scheme "light" is option A');
  // Option A against the designer's option A file (a review file: preview frame, local images, and dark forced on with @media all).
  const optA = fs.readFileSync(path.join(DESIGN, 'r2c-email-payment-failed-optA.html'), 'utf8');
  const strip = (h) => h.replace(/<style data-preview>[\s\S]*?<\/script>\n/, '').replace(/<!-- PREVIEW FRAME[\s\S]*?<!-- END PREVIEW FRAME -->\n/g, '').replace(/src="r2c-assets\//g, 'src="https://clubyuppie.com/email/').replaceAll('api=1&query=', 'api=1&amp;query=').replace('@media all {', '@media (prefers-color-scheme: dark) {');
  check(strip(optA) === a, 'scheme "light" renders as the designer\'s option A file');
}
{
  const ec = EMAIL_FIXTURES['event-changed'][0].data;
  check(!emails.renderEmail('event-changed', ec).html.includes('Choose what we email you'), 'footer switch link hidden while the Notifications page is off');
  process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS = 'on';
  check(emails.renderEmail('event-changed', ec).html.includes('href="https://clubyuppie.com/members/you/notifications"'), 'footer switch link shown when the Notifications page is on');
  delete process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS;
}
check(emails.EMAIL_FROM === 'Club Yuppie <noreply@clubyuppie.com>' && emails.EMAIL_REPLY_TO === 'hello@clubyuppie.com', 'C-D6 sender and reply-to');
check(emails.adminAlertsEmail() === 'hello@clubyuppie.com', 'C-D7 default alert address');

// ---------------------------------------------------------------- 8. Supabase templates and config
const AUTH = { magic_link: 'login-code', email_change: 'email-change-code', recovery: 'admin-password-reset' };
for (const t of supabase.SUPABASE_TEMPLATE_NAMES) {
  const file = fs.readFileSync(path.join(REPO, 'supabase/templates', `${t}.html`), 'utf8');
  check(file === supabase.renderSupabaseTemplate(t).html, `supabase/templates/${t}.html is out of date: run build-supabase-templates.mjs`);
  // One deliberate difference: Supabase strips comments (so the VML button goes), so the reset button keeps no mso-hide:all.
  const drawn = fs.readFileSync(path.join(DESIGN, `r2c-supabase-${AUTH[t]}.html`), 'utf8').replace('text-align:center;text-decoration:none;mso-hide:all;">Choose a new password', 'text-align:center;text-decoration:none;">Choose a new password');
  check(file === drawn, `supabase/templates/${t}.html differs from r2c-supabase-${AUTH[t]}.html`);
  check(!/class="btn[^"]*" style="[^"]*mso-hide:all/.test(file), `${t}: the html button is not hidden from Outlook (Supabase strips the VML one)`);
  check(file.includes('10 minutes'), `${t}: says 10 minutes`);
  const holes = file.match(/\{\{[^}]*\}\}/g) ?? [];
  check(holes.every((h) => ['{{ .Token }}', '{{ .Email }}', '{{ .NewEmail }}', '{{ .SiteURL }}', '{{ .TokenHash }}'].includes(h)), `${t}: unknown placeholder ${holes.join(' ')}`);
}
{
  const magic = fs.readFileSync(path.join(REPO, 'supabase/templates/magic_link.html'), 'utf8');
  check(/<div class="code t-card"[^>]*>\{\{ \.Token \}\}<\/div>/.test(magic), 'magic_link: {{ .Token }} is text in the code card');
  check(!/href="[^"]*(Token|ConfirmationURL)/.test(magic) && !magic.includes('ConfirmationURL'), 'magic_link: no link carries the token');
  // The local login helper (/home/claude/stack/tools/login.mjs) takes the first six-digit word in the mail.
  const filled = magic.replaceAll('{{ .Token }}', '709133').replaceAll('{{ .Email }}', 'e.member@example.com');
  check((filled.match(/\b(\d{6})\b/) ?? [])[1] === '709133', 'magic_link: the first six-digit word is the code (stack/tools/login.mjs)');
  const recovery = fs.readFileSync(path.join(REPO, 'supabase/templates/recovery.html'), 'utf8');
  check((recovery.match(/href="\{\{ \.SiteURL \}\}\/admin\/reset-confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery"/g) ?? []).length === 2, 'recovery: the reset link (button and Outlook button)');
  const change = fs.readFileSync(path.join(REPO, 'supabase/templates/email_change.html'), 'utf8');
  check(change.includes('{{ .Token }}') && change.includes('{{ .NewEmail }}') && change.includes('{{ .Email }}'), 'email_change: code, From and To');
  const toml = fs.readFileSync(path.join(REPO, 'supabase/config.toml'), 'utf8');
  const section = (name) => (toml.split(/^\[/m).find((s) => s.startsWith(`${name}]`)) ?? '');
  check(/^otp_expiry = 600$/m.test(section('auth.email')), 'config.toml: otp_expiry = 600');
  check(/^otp_length = 6$/m.test(section('auth.email')), 'config.toml: otp_length = 6');
  for (const t of supabase.SUPABASE_TEMPLATE_NAMES) {
    const s = section(`auth.email.template.${t}`);
    check(s.includes(`subject = "${supabase.SUPABASE_SUBJECTS[t]}"`), `config.toml: ${t} subject`);
    check(s.includes(`content_path = "./supabase/templates/${t}.html"`), `config.toml: ${t} content_path`);
  }
  check(supabase.SUPABASE_SUBJECTS.magic_link === 'Your Club Yuppie login code', 'A-D6: login code subject');
}

console.log(`${all.length} emails and states rendered; ${passed} checks passed, ${failures.length} failed`);
for (const f of failures.slice(0, 80)) console.log('  FAIL ' + f);
if (failures.length) process.exitCode = 1;
