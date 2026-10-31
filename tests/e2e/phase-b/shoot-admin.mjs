// Shots of the stage 2 admin screens (Reports, Photos, the dashboard, the nav) at the six widths, for looking at
// next to the design shots (v3/shots/msg-admin-*, photo-admin-*, v4/shots/r2b-admin-framed-*, r2b-admin-dash-*).
//   PHASE_B_BASE=http://localhost:3246 PHASE_B_TAG=ba. node tests/e2e/phase-b/shoot-admin.mjs [outdir] [path ...]
//   WIDTHS=390,1280 limits the widths. With no paths it shoots every screen: it makes a plan report (the seed's
//   is dismissed) and uses the prefix's seeded message and photo reports and photos, then the three dialogs.
// Logs in as the prefix's admin through the real /admin/login (password, then the authenticator code).
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import { BASE, PREFIX, action, exec, makeMemberWithPhoto, postPlan, q, rand, seeded } from './lib.mjs';

const out = process.argv[2] || '/tmp/ba-shots';
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [320, 390, 430, 768, 1024, 1280];

let pages = only;
let dialogs = [];
if (!only.length) {
  const s2 = seeded().stage2;
  const host = await makeMemberWithPhoto(`shot${rand()}`);
  const guest = await makeMemberWithPhoto(`shotg${rand()}`);
  const reporter = await makeMemberWithPhoto(`shotr${rand()}`);
  const planId = await postPlan(host, { title: 'Padel, then pizza', places: 4, where: 'Northgate Courts', note: 'Rackets to borrow at the desk.' });
  await action('invite.joinOpenInvite', [planId], guest.session);
  const planReport = (await action('invite.reportOpenInvite', [planId, 'Not a real plan'], reporter.session)).result.reportId;
  pages = [
    '/admin',
    '/admin/reports',
    `/admin/reports/${s2.reports.message}`,
    `/admin/reports/${s2.reports.photo}`,
    `/admin/reports/${planReport}`,
    '/admin/reports?tab=done',
    '/admin/photos',
    `/admin/photos/${s2.photos.filler1}`,
    `/admin/photos/${s2.photos.problem}`,
    '/admin/photos?tab=done',
  ];
  dialogs = [
    [`/admin/reports/${s2.reports.photo}`, 'Remove photo', 'dialog-remove-photo'],
    [`/admin/reports/${s2.reports.message}`, /^Suspend /, 'dialog-suspend'],
    [`/admin/reports/${planReport}`, 'Remove plan', 'dialog-remove-plan'],
    [`/admin/photos/${s2.photos.filler1}`, 'Remove and ask for a new one', 'dialog-remove-photo'],
  ];
}

const nameOf = (p, w, extra = '') => `${(p.replace(/^\/admin\/?/, 'admin-').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'admin').slice(0, 40)}${extra}-${w}.png`;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await loginAdmin(page, BASE, adminCreds(PREFIX));
  const go = async (p) => {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('main[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
  };
  for (const p of pages) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await go(p);
      const name = nameOf(p, w);
      await page.screenshot({ path: `${out}/${name}`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${name}${overflow > 0 ? `  OVERFLOW ${overflow}px` : ''}`);
    }
  }
  for (const [p, label, testId] of dialogs) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await go(p);
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => Object.keys(b).some((k) => k.startsWith('__react'))));
      await page.locator('.ad-card-col .ad-card').getByRole('button', { name: label }).first().click();
      await page.getByTestId(testId).waitFor();
      const name = nameOf(p, w, `-${testId}`);
      await page.screenshot({ path: `${out}/${name}` });
      console.log(name);
    }
  }
  // The Menu panel below 1100px, with the counts.
  for (const w of WIDTHS.filter((x) => x < 1100)) {
    await page.setViewportSize({ width: w, height: 900 });
    await go('/admin/reports');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.screenshot({ path: `${out}/${nameOf('/admin/reports', w, '-menu')}` });
    console.log(nameOf('/admin/reports', w, '-menu'));
  }
} finally {
  await browser.close();
  // Leave the queue as it was: the plan report this made is closed again.
  exec(`update reports set status = 'dismissed', acted_at = now(), action_note = 'shots cleanup' where status = 'open' and reporter_id in (select id from members where email like ${q(`${PREFIX}t-shotr%`)})`);
}
