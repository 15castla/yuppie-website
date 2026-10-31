// Screenshots of Open Invite at 320, 390, 430, 768, 1024 and 1280: the REAL pages on the local stack (web, signed
// in as the seeded bo. members, every plan state the seed has) and the preview harness (web and app: the app
// shows Open Invite only once NEXT_PUBLIC_MEMBERS_OPEN_INVITE_APP is on, so its frames come from the harness;
// the real app pages are shot too, where Open Invite is hidden).
//
//   PHASE_B_BASE=http://localhost:3243 PHASE_B_TAG=bo. node tests/e2e/phase-b/shoot-open-invite.mjs [--out DIR] [--only real|harness] [--widths 390,1280] [--full]
//
// First screen at each width (phone 844 tall, wider 900), 1x; --full adds the whole page. Prints OVERFLOW for any
// page wider than its viewport. While shooting, the seeded bo.active blocks every host that is not a seeded bo.
// member, so the feed shows the seed's plans only (other agents' test plans share the database); the blocks are
// removed at the end.
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, exec, memberSession, q, seeded, sql } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const out = opt('--out', '/home/claude/build-b/shots/open-invite');
const only = opt('--only', null);
const widths = opt('--widths', '320,390,430,768,1024,1280').split(',').map(Number);
const full = args.includes('--full');
const NATIVE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
fs.mkdirSync(out, { recursive: true });

const seed = seeded('bo.');
const M = seed.members;
const P = seed.stage2.plans;
const plan = (key) => `/members/open-invite/${P[key].id}`;

// ---------------------------------------------------------------- what to shoot
// real: [name, viewer, path, { click?: button name, app?: true }]
const REAL = [
  ['browse', 'active', '/members/open-invite'],
  ['yours', 'active', '/members/open-invite/yours'],
  ['plan-own', 'active', plan('climbing')],
  ['plan-in', 'active', plan('walk')],
  ['plan-open', 'active', plan('comedy')],
  ['plan-full', 'ending', plan('padel')],
  ['plan-cancelled', 'active', plan('gallery')],
  ['plan-past', 'active', plan('spin')],
  ['plan-asked', 'problem', plan('climbing')],
  ['sheet-report', 'active', plan('comedy'), { click: 'Report this invite' }],
  ['sheet-withdraw', 'active', plan('walk'), { click: 'Withdraw from this plan' }],
  ['sheet-cancel', 'active', plan('climbing'), { click: 'Cancel this invite' }],
  ['post', 'active', '/members/open-invite/new'],
  ['post-errors', 'active', '/members/open-invite/new', { click: 'Post Open Invite' }],
  ['edit', 'active', `${plan('climbing')}/edit`],
  ['posted', 'active', `/members/open-invite/new/done?id=${P.climbing.id}`],
  ['plans', 'active', '/members/plans'],
  ['app-landing', 'active', '/members', { app: true }],
  ['app-open-invite-404', 'active', '/members/open-invite', { app: true }],
  ['app-plans', 'active', '/members/plans', { app: true }],
];
// harness: [name, screen, state]
const HARNESS = [
  ['browse', 'invite-browse', 'default'],
  ['browse-empty', 'invite-browse', 'empty'],
  ['browse-filter', 'invite-browse', 'filter'],
  ['yours', 'invite-yours', 'default'],
  ['yours-empty', 'invite-yours', 'empty'],
  ...['open', 'pending', 'in', 'own', 'full', 'cancelled', 'past', 'asked', 'joined', 'taken', 'withdraw', 'report', 'report-sent', 'cancel', 'cancel-done', 'refused'].map((s) => [`plan-${s}`, 'invite-plan', s]),
  ['post', 'invite-post', 'empty'],
  ['post-errors', 'invite-post', 'errors'],
  ['post-server-error', 'invite-post', 'server-error'],
  ['post-pending', 'invite-post', 'pending'],
  ['posted', 'invite-post', 'done'],
  ['edit', 'invite-edit', 'default'],
  ['edit-errors', 'invite-edit', 'errors'],
];

// ---------------------------------------------------------------- a clean feed for bo.active (the real pages only)
const others = only === 'harness' ? [] : sql(
  `select distinct p.host_id id from plans p join members m on m.id = p.host_id where p.status = 'scheduled' and p.starts_at > now() and not (m.email like 'bo.%' and m.email not like 'bo.t-%')`,
).map((r) => r.id);
const added = [];
for (const id of others) {
  const had = sql(`select 1 from blocks where blocker_id = ${q(M.active.id)} and blocked_id = ${q(id)}`).length;
  if (!had) {
    exec(`insert into blocks (blocker_id, blocked_id) values (${q(M.active.id)}, ${q(id)}) on conflict do nothing`);
    added.push(id);
  }
}

const sessions = {};
const browser = await chromium.launch();
const overflow = [];
async function shoot(name, url, { viewer = null, app = false, click = null } = {}) {
  for (const w of widths) {
    const phone = w < 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, deviceScaleFactor: 1, ...(app ? { userAgent: NATIVE_UA } : {}) });
    if (viewer) {
      sessions[viewer] ??= await memberSession(M[viewer].email);
      const host = new URL(BASE).hostname;
      await ctx.addCookies(cookieFor(sessions[viewer]).split('; ').map((part) => {
        const i = part.indexOf('=');
        return { name: part.slice(0, i), value: part.slice(i + 1), domain: host, path: '/' };
      }));
    }
    if (app) await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = ':root{--native-safe-area-inset-top:59px;--native-safe-area-inset-bottom:34px}';
      document.head.appendChild(s);
    }));
    const page = await ctx.newPage();
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
    if (click) {
      await page.getByRole('button', { name: click }).filter({ visible: true }).first().click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(250);
    const file = `${out}/${name}-${w}.png`;
    await page.screenshot({ path: file });
    if (full) await page.screenshot({ path: `${out}/${name}-${w}-full.png`, fullPage: true });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) overflow.push(`${name}-${w} (${sw})`);
    await ctx.close();
  }
  console.log(`shot ${name}`);
}

try {
  if (only !== 'harness') {
    for (const [name, viewer, path, extra = {}] of REAL) await shoot(`real-${name}`, path, { viewer, ...extra });
  }
  if (only !== 'real') {
    for (const shell of ['web', 'app']) {
      for (const [name, screen, state] of HARNESS) await shoot(`harness-${shell}-${name}`, `/dev-preview/${screen}?shell=${shell}&state=${state}&unread=2`);
    }
  }
} finally {
  await browser.close();
  for (const id of added) exec(`delete from blocks where blocker_id = ${q(M.active.id)} and blocked_id = ${q(id)}`);
}
console.log(overflow.length ? `OVERFLOW: ${overflow.join(', ')}` : 'no horizontal overflow at any width');
