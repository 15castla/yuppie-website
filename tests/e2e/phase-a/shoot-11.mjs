// Screenshots of the real You and system pages (not the preview harness), for looking at next to the design
// shots. Logs in by setting the member's real session cookie (lib.mjs cookieFor), web or app (the app's
// User-Agent marker), at 320, 390, 430, 768, 1024 and 1280 (phones at 2x).
//
//   node tests/e2e/phase-a/shoot-11.mjs <out dir> <name>=<path>[@<member email>] ... [--app] [--full] [--widths 390,1280]
//     [--click "<button name>[><next button>...]"] [--wait <ms>] [--header k:v]
// Example: node tests/e2e/phase-a/shoot-11.mjs /tmp/shots you=/members/you@y.active@example.com --full
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, memberSession } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const out = args[0];
const targets = args.slice(1).filter((a, i, all) => a.includes('=') && !a.startsWith('--') && !['--widths', '--click', '--wait', '--header', '--scroll'].includes(all[i - 1]));
const widths = opt('--widths', '320,390,430,768,1024,1280').split(',').map(Number);
const app = flag('--app');
const full = flag('--full');
const click = opt('--click', null);
const wait = Number(opt('--wait', '400'));
const scroll = Number(opt('--scroll', '0'));
const header = opt('--header', null);
fs.mkdirSync(out, { recursive: true });

const sessions = new Map();
async function cookiesFor(email) {
  if (!email) return [];
  if (!sessions.has(email)) sessions.set(email, await memberSession(email));
  const host = new URL(BASE).hostname;
  return cookieFor(sessions.get(email)).split('; ').map((pair) => {
    const i = pair.indexOf('=');
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: '/' };
  });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  for (const t of targets) {
    const [name, rest] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
    const at = rest.indexOf('@');
    const urlPath = at >= 0 ? rest.slice(0, at) : rest;
    const email = at >= 0 ? rest.slice(at + 1) : null;
    for (const w of widths) {
      const phone = w < 768;
      const ctx = await browser.newContext({
        viewport: { width: w, height: phone ? 844 : 900 },
        deviceScaleFactor: phone ? 2 : 1,
        userAgent: app ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp' : undefined,
        extraHTTPHeaders: header ? { [header.split(':')[0]]: header.split(':').slice(1).join(':') } : undefined,
      });
      await ctx.addCookies(await cookiesFor(email));
      const pg = await ctx.newPage();
      await pg.goto(`${BASE}${urlPath}`, { waitUntil: 'networkidle' }).catch(() => {});
      await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 15000 }).catch(() => {});
      // The Next dev badge is the dev server's, not the page's.
      await pg.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
      for (const name of click ? click.split('>') : []) {
        const scope = (await pg.locator('dialog[open]').count()) ? pg.locator('dialog[open]') : pg;
        await scope.getByRole('button', { name, exact: true }).first().click();
        await pg.waitForTimeout(900);
      }
      if (scroll) await pg.evaluate((y) => window.scrollTo(0, y), scroll);
      await pg.waitForTimeout(wait);
      const file = path.join(out, `${name}-${app ? 'app' : 'web'}-${w}.png`);
      await pg.screenshot({ path: file, fullPage: full });
      const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
      console.log(`${file}${sw > w ? `  HORIZONTAL SCROLL ${sw}` : ''}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
