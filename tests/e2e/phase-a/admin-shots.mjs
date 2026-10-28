// Screenshots of admin pages at the six widths, logged in as the local test admin (aal2, through /admin/login).
//   node tests/e2e/phase-a/admin-shots.mjs [--base http://localhost:3145] [--prefix a.] [--out DIR] [--widths 320,390,...]
//        [--full] [--anon] name=/admin/path [name=/admin/path ...]   (a path may end in "#click=<css>|fill=<css>=><value>|wait=<ms>")
// Writes <out>/<name>-<width>.png. The signed-in state is kept in <out>/.state.json and reused while it works.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'http://localhost:3145');
const PREFIX = argOf('--prefix', 'a.');
const OUT = argOf('--out', '/home/claude/build-a/shots/admin');
const WIDTHS = argOf('--widths', '320,390,430,768,1024,1280').split(',').map(Number);
const FULL = args.includes('--full');
const ANON = args.includes('--anon');
const targets = args.filter((a) => /^[\w.-]+=\//.test(a)).map((a) => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; });
fs.mkdirSync(OUT, { recursive: true });
const STATE = path.join(OUT, '.state.json');

const browser = await chromium.launch();
try {
  const opts = { locale: 'en-GB', timezoneId: 'Europe/London' };
  let ctx = ANON ? await browser.newContext(opts) : fs.existsSync(STATE) ? await browser.newContext({ ...opts, storageState: STATE }) : null;
  if (ctx && !ANON) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/admin`);
    if (new URL(p.url()).pathname.startsWith('/admin/login')) { await ctx.close(); ctx = null; }
    else await p.close();
  }
  if (!ctx) {
    ctx = await browser.newContext({ ...opts, viewport: { width: 1280, height: 900 } });
    await loginAdmin(await ctx.newPage(), BASE, adminCreds(PREFIX));
    await ctx.storageState({ path: STATE });
  }
  for (const [name, target] of targets) {
    const cut = target.indexOf('#');
    const url = cut < 0 ? target : target.slice(0, cut);
    const action = cut < 0 ? '' : target.slice(cut + 1);
    for (const w of WIDTHS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: w < 700 ? 844 : 900 });
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
      // Actions, separated by "|": click=<css>, fill=<css>=><value>, wait=<ms>.
      for (const step of (action ?? '').split('|').filter(Boolean)) {
        if (step.startsWith('click=')) await page.locator(step.slice(6)).first().click({ timeout: 4000 }).catch(() => console.log(`  (${name}-${w}: nothing to click for ${step.slice(6)})`));
        else if (step.startsWith('fill=')) { const [sel, value] = step.slice(5).split('=>'); await page.locator(sel).first().fill(value); }
        else if (step.startsWith('wait=')) await page.waitForTimeout(Number(step.slice(5)));
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: FULL });
      console.log(`${name}-${w}.png${overflow > 0 ? `  OVERFLOW ${overflow}px` : ''}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
