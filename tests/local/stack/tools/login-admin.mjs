// Log the local test admin in through the real /admin/login page: password, then a TOTP code computed from
// the secret seed.mjs saved, to an aal2 session.
//
// Module: import { loginAdmin, adminCreds } from '/home/claude/stack/tools/login-admin.mjs'
//         await loginAdmin(page, 'http://127.0.0.1:3141', adminCreds('f.'))   // -> { aal: 'aal2', url }
// CLI:    source /home/claude/stack/app.env && node /home/claude/stack/tools/login-admin.mjs [--prefix f.] [--base URL] [--state file.json]
//         (run seed.mjs with the same prefix first; --state saves the signed-in browser state for Playwright)
import fs from 'node:fs';
import { freshTotp } from './totp.mjs';

const DIR = '/home/claude/stack/tools';
export const LOCAL_ADMIN_PASSWORD = 'local-admin-password-1';

export function adminCreds(prefix = 'f.') {
  const file = `${DIR}/admin-${prefix}json`;
  if (!fs.existsSync(file)) throw new Error(`no ${file}: run seed.mjs --prefix ${prefix} first`);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { email: saved.email, password: LOCAL_ADMIN_PASSWORD, secret: saved.secret };
}

/** The session the browser holds, read from the Supabase auth cookie (sb-<ref>-auth-token, possibly chunked). */
export async function sessionFromCookies(context) {
  const cookies = await context.cookies();
  const auth = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  if (!auth.length) return null;
  let value = auth.length === 1 ? auth[0].value : auth.map((c) => c.value).join('');
  value = decodeURIComponent(value);
  if (value.startsWith('base64-')) value = Buffer.from(value.slice(7), 'base64url').toString('utf8');
  try { return JSON.parse(value); } catch { return null; }
}

export function jwtClaims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

export async function loginAdmin(page, base, { email, password, secret }) {
  await page.goto(`${base}/admin/login`);
  // Wait for the page's JavaScript (a dev server hydrates slowly): before it, Enter would submit natively.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => {
    const el = document.querySelector('input[type="email"]');
    return Boolean(el && Object.keys(el).some((k) => k.startsWith('__react')));
  }, null, { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('input[type="password"]').first().press('Enter');
  const code = page.locator('input[autocomplete="one-time-code"]:visible').first();
  await code.waitFor({ state: 'visible', timeout: 20000 });
  // A code with at least 8 seconds left; if Auth turns it down (same window already used), wait for the next one.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await code.fill(await freshTotp(secret, 8));
    await code.press('Enter');
    try {
      await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.startsWith('/admin/login'), { timeout: 15000 });
      break;
    } catch (err) {
      if (attempt === 1) throw err;
      await new Promise((r) => setTimeout(r, 31000));
    }
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  const session = await sessionFromCookies(page.context());
  const aal = session?.access_token ? jwtClaims(session.access_token).aal : null;
  if (aal !== 'aal2') throw new Error(`admin login ended at ${aal ?? 'no session'}, not aal2`);
  return { aal, url: page.url(), session };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const result = await loginAdmin(page, argOf('--base', 'http://localhost:3141'), adminCreds(argOf('--prefix', 'f.')));
    const state = argOf('--state', null);
    if (state) await context.storageState({ path: state });
    console.log(JSON.stringify({ ok: true, aal: result.aal, url: result.url, heading: (await page.locator('h1').first().textContent().catch(() => null))?.trim() }));
  } finally {
    await browser.close();
  }
}
