// The email preview against a running server.
//   node tests/e2e/phase-a/emails/check-preview.mjs http://127.0.0.1:3142 on [outDir]
//     (server started with MEMBERS_PREVIEW=1): the page lists every email,
//     its frames load with their images, light and dark, and it is shot.
//   node tests/e2e/phase-a/emails/check-preview.mjs http://127.0.0.1:3142 off
//     (server started without it): every preview URL is a 404, like the rest of the harness.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const [base, mode = 'on', outArg] = process.argv.slice(2);
if (!base) throw new Error('usage: check-preview.mjs <base url> on|off [outDir]');
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };
const URLS = [
  '/dev-preview/emails',
  '/dev-preview/emails?email=plan-reminder&fixture=2h',
  '/dev-preview/emails/raw/new-message?fixture=design',
  '/dev-preview/emails?email=booking-confirmed&fixture=design',
  '/dev-preview/emails/raw/booking-confirmed?fixture=design',
  '/dev-preview/emails/raw/auth-magic_link?part=text',
];

if (mode === 'off') {
  for (const u of URLS) {
    const res = await fetch(base + u, { redirect: 'manual' });
    check(res.status === 404, `${u}: ${res.status}, expected 404`);
  }
} else {
  const out = outArg || fs.mkdtempSync(path.join(os.tmpdir(), 'email-preview-'));
  fs.mkdirSync(out, { recursive: true });
  for (const u of URLS) {
    const res = await fetch(base + u);
    check(res.status === 200, `${u}: ${res.status}, expected 200`);
  }
  const text = await (await fetch(base + '/dev-preview/emails/raw/auth-magic_link?part=text')).text();
  check(text.includes('482913') && !text.includes('{{'), 'auth template preview fills its placeholders');
  check((await fetch(base + '/dev-preview/emails/raw/no-such-email')).status === 404, 'unknown email is a 404');

  const { chromium } = createRequire('/home/claude/stack/tools/')('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  for (const [email, fixture] of [['booking-confirmed', 'design'], ['payment-failed', 'design'], ['auth-magic_link', 'design'], ['plan-cancelled', 'design'], ['new-message', 'reply'], ['admin-new-report', 'plan']]) {
    await page.goto(`${base}/dev-preview/emails?email=${email}&fixture=${fixture}`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => [...document.querySelectorAll('iframe.pve-frame')].every((f) => f.contentDocument?.readyState === 'complete' && parseInt(f.style.height) !== 1200), null, { timeout: 60000 }).catch(() => {});
    const info = await page.evaluate(() => {
      const frames = [...document.querySelectorAll('iframe.pve-frame')];
      return {
        frames: frames.map((f) => ({ w: f.getBoundingClientRect().width, h: f.getBoundingClientRect().height, imgs: [...f.contentDocument.images].map((i) => i.naturalWidth > 0) })),
        darkBg: frames[3] ? getComputedStyle(frames[3].contentDocument.body).backgroundColor : null,
        lightBg: frames[0] ? getComputedStyle(frames[0].contentDocument.body).backgroundColor : null,
        nav: document.querySelectorAll('.pve-nav li').length,
        text: document.querySelector('.pve-count')?.textContent,
        texts: Object.fromEntries([...document.querySelectorAll('.pve-text')].map((t) => [t.dataset.text, t.querySelector('.pve-count').textContent])),
      };
    });
    check(info.frames.length === 6, `${email}: 6 frames (3 widths, light and dark), got ${info.frames.length}`);
    check(info.frames.map((f) => Math.round(f.w)).join() === '320,390,640,320,390,640', `${email}: frame widths ${info.frames.map((f) => f.w).join()}`);
    check(info.frames.every((f) => f.h > 500), `${email}: frames grew to the email height`);
    check(info.frames.every((f) => f.imgs.length > 0 && f.imgs.every(Boolean)), `${email}: every image loaded from public/email`);
    check(info.lightBg === 'rgb(255, 217, 4)' && info.darkBg === 'rgb(27, 21, 18)', `${email}: light ${info.lightBg}, dark ${info.darkBg}`);
    check(info.nav === 25, `${email}: the list has 22 emails and 3 Supabase templates, got ${info.nav}`);
    check(info.text?.startsWith('59 of 70 characters, Unicode'), `welcome text count: ${info.text}`);
    // Every text and state, with its count and the Unicode flag (stage 2).
    check(Object.keys(info.texts).length === 10, `${email}: 10 texts and states, got ${Object.keys(info.texts).length}`);
    check(info.texts['event-reminder/design']?.startsWith('107 of 160 characters, Standard, 1 text'), `event reminder text: ${info.texts['event-reminder/design']}`);
    check(info.texts['plan-reminder/2h']?.startsWith('130 of 160 characters, Standard, 1 text'), `plan reminder text: ${info.texts['plan-reminder/2h']}`);
    check(/Unicode .*2 texts/.test(info.texts['plan-reminder/unicode'] ?? ''), `Unicode flag: ${info.texts['plan-reminder/unicode']}`);
    await page.screenshot({ path: path.join(out, `preview-${email}.png`), fullPage: true });
  }
  await browser.close();
  console.log(`shots in ${out}`);
}
console.log(failures.length ? `${failures.length} failed:\n  ${failures.join('\n  ')}` : `preview ${mode}: all checks passed`);
if (failures.length) process.exitCode = 1;
