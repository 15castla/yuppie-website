// Log a member in through the real /member-login page using the code from the local mailbox.
// Usage (module): import { loginMember } from '/home/claude/stack/tools/login.mjs'; await loginMember(page, base, email)
import fs from 'node:fs';
import path from 'node:path';
const BOX = '/home/claude/stack/mail/box';
function latestCode(email, since) {
  const files = ['new', 'cur'].flatMap((d) => { const p = path.join(BOX, d); return fs.existsSync(p) ? fs.readdirSync(p).map((f) => path.join(p, f)) : []; });
  const hits = files.map((f) => ({ f, m: fs.statSync(f).mtimeMs, t: fs.readFileSync(f, 'utf8') }))
    .filter((x) => x.m >= since && x.t.toLowerCase().includes(`to: ${email.toLowerCase()}`))
    .sort((a, b) => b.m - a.m);
  for (const h of hits) {
    const body = h.t.replace(/=\r?\n/g, '');
    const m = body.match(/\b(\d{6})\b/);
    if (m) return m[1];
  }
  return null;
}
export async function waitForCode(email, since, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const c = latestCode(email, since); if (c) return c; await new Promise((r) => setTimeout(r, 300)); }
  throw new Error(`no login code for ${email}`);
}
export async function loginMember(page, base, email) {
  const since = Date.now() - 1000;
  await page.goto(`${base}/member-login`);
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole('button', { name: /send|continue|code/i }).first().click();
  const code = await waitForCode(email, since);
  const input = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]').first();
  await input.fill(code);
  const btn = page.getByRole('button', { name: /log in|verify|continue/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
  await page.waitForURL((u) => u.pathname.startsWith('/members'), { timeout: 20000 });
}
