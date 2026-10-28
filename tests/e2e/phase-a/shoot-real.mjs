// Screenshots of REAL members pages (not the preview harness), signed in as a seeded member, at the six widths.
//   node tests/e2e/phase-a/shoot-real.mjs <email|-> <path> [--widths 320,390,430,768,1024,1280] [--app] [--full]
//        [--out DIR] [--name NAME] [--click "Book my spot"] [--wait 800]
// "-" as the email shoots signed out (the login page). Phone widths at 2x, wider at 1x. Prints each file and its
// scrollWidth (OVERFLOW when wider than the viewport). Uses PHASE_A_BASE (default http://localhost:3143 here).
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { cookieFor, memberSession } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const [email, path] = args;
const base = process.env.PHASE_A_BASE || 'http://localhost:3143';
const widths = opt('--widths', '320,390,430,768,1024,1280').split(',').map(Number);
const app = args.includes('--app');
const full = args.includes('--full');
const out = opt('--out', '/home/claude/build/shots/flows-real');
const name = opt('--name', path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));
const click = opt('--click', null);
const waitMs = Number(opt('--wait', '600'));
fs.mkdirSync(out, { recursive: true });

const session = email && email !== '-' ? await memberSession(email) : null;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const w of widths) {
  const phone = w < 768;
  // The app is told apart by its User-Agent marker (lib/native-app.ts; proxy.ts drops the cookie without it).
  const ctx = await browser.newContext({
    viewport: { width: w, height: phone ? 844 : 900 },
    deviceScaleFactor: phone ? 2 : 1,
    ...(app ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp' } : {}),
  });
  const host = new URL(base).hostname;
  const cookies = [];
  if (session) {
    for (const part of cookieFor(session).split('; ')) {
      const i = part.indexOf('=');
      cookies.push({ name: part.slice(0, i), value: part.slice(i + 1), domain: host, path: '/' });
    }
  }
  if (cookies.length) await ctx.addCookies(cookies);
  await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(s);
  }));
  // The iPhone's insets, as the app injects them (and as the preview harness simulates them): 59px and 34px.
  if (app) {
    await ctx.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = ':root{--native-safe-area-inset-top:59px;--native-safe-area-inset-bottom:34px}';
        document.head.appendChild(s);
      });
    });
  }
  const page = await ctx.newPage();
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (click) {
    await page.getByRole('button', { name: click }).filter({ visible: true }).first().click();
  }
  await page.waitForTimeout(waitMs);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const file = `${out}/${name}-${app ? 'app' : 'web'}-${w}.png`;
  await page.screenshot({ path: file, fullPage: full });
  console.log(file, 'scrollWidth', sw, sw > w ? 'OVERFLOW' : '');
  await ctx.close();
}
await browser.close();
