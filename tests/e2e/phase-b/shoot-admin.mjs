// Shots of the stage 2 admin screens (Reports, Photos, the dashboard, the nav) at the six widths, for looking at
// next to the design shots (v3/shots/msg-admin-*, photo-admin-*, v4/shots/r2b-admin-framed-*, r2b-admin-dash-*).
//   PHASE_B_BASE=http://localhost:3246 PHASE_B_TAG=ba. node tests/e2e/phase-b/shoot-admin.mjs [outdir] [path ...]
// Logs in as the prefix's admin through the real /admin/login (password, then the authenticator code).
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import { BASE, PREFIX } from './lib.mjs';

const out = process.argv[2] || '/tmp/ba-shots';
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [320, 390, 430, 768, 1024, 1280];
const pages = only.length ? only : ['/admin', '/admin/reports', '/admin/reports?tab=done', '/admin/photos', '/admin/photos?tab=done'];

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await loginAdmin(page, BASE, adminCreds(PREFIX));
  for (const p of pages) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !document.querySelector('main[aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      const name = `${p.replace(/^\/admin\/?/, 'admin-').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'admin'}-${w}.png`;
      await page.screenshot({ path: `${out}/${name}`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${name}${overflow > 0 ? `  OVERFLOW ${overflow}px` : ''}`);
    }
  }
} finally {
  await browser.close();
}
