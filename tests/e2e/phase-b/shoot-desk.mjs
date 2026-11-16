// Screenshots of the Outreach Desk (17 Nov 2026) at a computer (1440) and a phone (390), signed in as the owner
// (bf.), of whatever the local desk holds: home, Today, Partners, New partner, Settings and the first two partners.
// Also checks nothing scrolls sideways. Run from a scratch folder (it writes there), not inside the repo:
//   cd /tmp && node /home/claude/co/tests/e2e/phase-b/shoot-desk.mjs [out-dir]
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import { BASE, sql } from './lib.mjs';

const OUT = process.argv[2] ?? 'desk-shots';
fs.mkdirSync(OUT, { recursive: true });
const partners = sql(`select id from outreach_targets order by stage_at desc limit 2`).map((r) => `/admin/desk/t/${r.id}`);
const browser = await chromium.launch();
let sideways = 0;
for (const [w, h, tag] of [[1440, 900, 'computer'], [390, 844, 'phone']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await loginAdmin(page, BASE, adminCreds('bf.'));
  for (const path of ['/admin/desk', '/admin/desk/today', '/admin/desk/partners', '/admin/desk/new', '/admin/desk/settings', ...partners]) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const name = path.replace('/admin/desk', 'desk').replace(/\//g, '-').replace(/-t-([0-9a-f]{8}).*/, '-partner-$1');
    await page.screenshot({ path: `${OUT}/${name}-${tag}.png`, fullPage: true });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) { sideways += 1; console.log(`${path} at ${w}: scrolls sideways by ${over}px`); }
  }
  await ctx.close();
}
await browser.close();
console.log(sideways ? `${sideways} pages scroll sideways` : 'nothing scrolls sideways', `; shots in ${OUT}`);
