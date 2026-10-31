// Look at every email: each fixture of each email at 320, 390 and 640 wide,
// light and dark (real prefers-color-scheme: dark), as full-page PNGs, with
// the sandbox's local brand fonts (as the r2c shots were taken) and the
// images from public/email/. Then:
//  - the design example of each email is compared, pixel for pixel, with the
//    designer's send-ready file shot the same way (out/r2c-send-*.html);
//  - every shot is measured: no sideways scroll, buttons 56px tall, stand-alone
//    links at least 44px tall, nothing under 13px.
//
//   node tests/e2e/phase-a/emails/shoot-emails.mjs [outDir]
//
// Plain Node; Playwright from /home/claude/stack/node_modules. Exit code 1 on
// any failed comparison or measurement.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadEmails, REPO } from './load-emails.mjs';
import { designOf, toDrawnWords } from './design-sources.mjs';

const requireStack = createRequire('/home/claude/stack/tools/');
const { chromium } = requireStack('playwright');

const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'email-shots-'));
const DESIGN = '/home/claude/rebrand/v4/out';
const FONTS = '<link rel="stylesheet" href="file:///home/claude/rebrand/ref/fonts-local.css">';
const SITE = 'https://clubyuppie.com';
const WIDTHS = [320, 390, 640];
// Only these emails (and the Supabase templates when 'auth' is listed): SHOOT_ONLY=plan-changed,new-message
const ONLY = (process.env.SHOOT_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'email-html-'));

const emails = await loadEmails();
const { EMAIL_FIXTURES } = await loadEmails('fixtures.ts');
const supabase = await loadEmails('supabase.ts');

// Files to shoot: [key, html, designFile|null]
const jobs = [];
for (const name of emails.EMAIL_NAMES) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  for (const fx of EMAIL_FIXTURES[name]) {
    // notificationsLink on, as drawn, so the design example matches the design file.
    const r = emails.renderEmailWith(name, fx.data, { site: SITE, notificationsLink: true });
    const d = designOf(name);
    // The round 3 emails (event, plan reminder, chat nudge) are in the older shell: no file to compare pixels with.
    const design = fx.id === 'design' && d.kind === 'send' ? d.html : null;
    // The comparison puts the design example's own words back (design-sources.mjs); the shots keep ours.
    const cmp = design ? toDrawnWords(name, r.html) : null;
    jobs.push({ key: `${name}--${fx.id}`, html: r.html, design, cmp: cmp !== r.html ? cmp : null });
  }
}
const AUTH = { magic_link: 'login-code', email_change: 'email-change-code', recovery: 'admin-password-reset' };
for (const t of ONLY.length && !ONLY.includes('auth') ? [] : supabase.SUPABASE_TEMPLATE_NAMES) {
  const fill = (s) => s.replaceAll('{{ .Token }}', '482913').replaceAll('{{ .Email }}', 'sam@example.com')
    .replaceAll('{{ .NewEmail }}', 'sam.new@example.com').replaceAll('{{ .SiteURL }}', SITE).replaceAll('{{ .TokenHash }}', 'd41d8cd9');
  const html = fill(fs.readFileSync(path.join(REPO, 'supabase/templates', `${t}.html`), 'utf8'));
  const designHtml = fill(fs.readFileSync(path.join(DESIGN, `r2c-supabase-${AUTH[t]}.html`), 'utf8'));
  const designFile = path.join(TMP, `design-auth-${t}.html`);
  fs.writeFileSync(designFile, designHtml);
  jobs.push({ key: `auth-${t}--design`, html, design: designFile });
}

function toFile(key, html) {
  const f = path.join(TMP, `${key}.html`);
  fs.writeFileSync(f, html.replace('</head>', `${FONTS}\n</head>`));
  return f;
}

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const failures = [];
const MEASURE = `(() => {
  const out = { scrollW: document.documentElement.scrollWidth, vw: innerWidth, h: document.documentElement.scrollHeight, buttons: [], links: [], minFont: 99, overflow: [] };
  for (const a of document.querySelectorAll('a.btn')) out.buttons.push(Math.round(a.getBoundingClientRect().height));
  for (const a of document.querySelectorAll('a')) {
    const r = a.getBoundingClientRect();
    const inSentence = a.closest('p') !== null;
    if (!inSentence && r.width > 0 && !a.querySelector('img') && !a.classList.contains('btn')) out.links.push([a.textContent.trim(), Math.round(r.height)]);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode; const el = n.parentElement;
    if (!n.textContent.trim() || !el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.closest('[style*="display:none"]')) continue;
    out.minFont = Math.min(out.minFont, parseFloat(cs.fontSize));
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 0.5) out.overflow.push(n.textContent.trim().slice(0, 40));
  }
  return out;
})()`;

async function shoot(file, width, dark, outPng) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: width < 700 ? 2 : 1, colorScheme: dark ? 'dark' : 'light' });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (r) => r.abort());
  await ctx.route(/^https:\/\/clubyuppie\.com\/email\/(.+)$/, (r) => {
    const name = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop());
    r.fulfill({ path: path.join(REPO, 'public/email', name), contentType: 'image/png' });
  });
  const page = await ctx.newPage();
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(150);
  const m = await page.evaluate(MEASURE);
  const png = await page.screenshot({ path: outPng, fullPage: true });
  await ctx.close();
  return { m, png };
}

let shots = 0;
for (const job of jobs) {
  const mine = toFile(job.key, job.html);
  const theirs = job.design ? toFile(`design-${job.key}`, fs.readFileSync(job.design, 'utf8')) : null;
  const mineCmp = job.cmp ? toFile(`cmp-${job.key}`, job.cmp) : null;
  for (const dark of [false, true]) {
    for (const w of WIDTHS) {
      const tag = `${job.key}-${w}${dark ? '-dark' : ''}`;
      const { m, png } = await shoot(mine, w, dark, path.join(OUT, `${tag}.png`));
      shots++;
      if (m.scrollW > m.vw) failures.push(`${tag}: sideways scroll ${m.scrollW} > ${m.vw}`);
      if (m.overflow.length) failures.push(`${tag}: text past the edge: ${m.overflow.join(' | ')}`);
      for (const h of m.buttons) if (h !== 56) failures.push(`${tag}: button ${h}px tall, not 56`);
      for (const [t, h] of m.links) if (h < 44) failures.push(`${tag}: link "${t}" ${h}px tall, under 44`);
      if (m.minFont < 13) failures.push(`${tag}: type at ${m.minFont}px, under 13`);
      if (theirs) {
        const d = await shoot(theirs, w, dark, path.join(OUT, `${tag}--design.png`));
        const ours = mineCmp ? (await shoot(mineCmp, w, dark, path.join(OUT, `${tag}--cmp.png`))).png : png;
        if (!ours.equals(d.png)) failures.push(`${tag}: pixels differ from the design file ${path.basename(job.design)}`);
        else {
          fs.rmSync(path.join(OUT, `${tag}--design.png`));
          if (mineCmp) fs.rmSync(path.join(OUT, `${tag}--cmp.png`));
        }
      }
    }
  }
}
await browser.close();
console.log(`${jobs.length} emails and states, ${shots} shots in ${OUT}`);
if (failures.length) {
  console.log(`${failures.length} findings:`);
  for (const f of failures) console.log('  ' + f);
  process.exitCode = 1;
} else {
  console.log('every design example matches its send-ready file pixel for pixel; no sideways scroll, buttons 56px, links 44px or more, nothing under 13px');
}
