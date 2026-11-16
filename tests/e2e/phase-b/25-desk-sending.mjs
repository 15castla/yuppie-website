// The Outreach Desk's buttons while a form is being sent (Albert, 16 Nov 2026: "The import button doesn't do anything
// to show if the click is loading and is fairly delayed"), in a real browser against the local stack and a
// production build, with every desk server action held back 1.5 s so the in-between state can be seen:
//   Import: the button says "Importing 1 partner…", is busy and disabled, and a line says it can take a while; then
//     "Imported." and a fresh form (no preview, Import greyed out); the same file again: "Nothing new";
//   a note: "Saving…" on Save note while it goes;
//   an action point's Done and Drop: only the one pressed says "Saving…", both are disabled (nothing sent twice).
//   node tests/e2e/phase-b/25-desk-sending.mjs     (needs: seed.mjs --prefix bf.; bf. the owner)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import { BASE, done, eq, exec, ok, q, rand, sql1 } from './lib.mjs';

const MARK = `S${rand()}`;
const ownerSaved = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-bf.json', 'utf8'));
exec(`update admin_users set is_owner = false where is_owner; update admin_users set is_owner = true where id = ${q(ownerSaved.userId)}`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-sending-'));
const file = path.join(dir, 'import.json');
fs.writeFileSync(file, JSON.stringify({
  format: 'club-yuppie-desk-import', version: 1,
  targets: [{
    key: `${MARK}-imp`, name: `${MARK} Sending`, category: 'cafe', stage: 'contacted',
    contacts: [{ key: `${MARK}-c`, name: `${MARK} Manager`, mailbox_type: 'named_person', email: `${MARK.toLowerCase()}@example-sending.test`, email_source: 'published' }],
    touches: [{ key: `${MARK}-e`, sequence: `${MARK}-e`, channel: 'email', kind: 'first', sent_at: '2026-11-12T09:00:00Z', to: [`${MARK}-c`] }],
    outcomes: [], notes_list: [],
    actions: [{ key: `${MARK}-a1`, kind: 'task', title: `${MARK} first`, due_on: '2026-11-20' }, { key: `${MARK}-a2`, kind: 'task', title: `${MARK} second`, due_on: '2026-11-21' }],
  }],
}));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await loginAdmin(page, BASE, adminCreds('bf.'));
await page.route('**/admin/desk/**', async (route) => {
  if (route.request().method() === 'POST' && route.request().headers()['next-action']) await new Promise((r) => setTimeout(r, 1500));
  await route.continue();
});
const state = (sel) => page.evaluate((s) => {
  const b = document.querySelector(s);
  return b && { text: b.textContent.trim(), busy: b.getAttribute('aria-busy'), disabled: b.disabled, opacity: getComputedStyle(b).opacity };
}, sel);
const flash = () => page.locator('.dk-flash').textContent();

// ---------------------------------------------------------------------------------------------------------- import
const IMPORT = 'form:has(input[name=file]) button[type=submit]';
await page.goto(`${BASE}/admin/desk/settings`, { waitUntil: 'networkidle' });
eq(await state(IMPORT), { text: 'Import', busy: null, disabled: true, opacity: '0.45' }, 'before a file: Import, greyed out');
await page.setInputFiles('input[name=file]', file);
await page.waitForSelector('.dk-table');
eq((await state(IMPORT)).text, 'Import 1 partner', 'with the file: Import 1 partner (one, not "1 partners")');
await page.click(IMPORT);
await page.waitForSelector(`${IMPORT}[aria-busy=true]`, { timeout: 1000 });
await page.mouse.move(0, 0); // off the button, so its colour isn't the hover's
eq(await state(IMPORT), { text: 'Importing 1 partner…', busy: 'true', disabled: true, opacity: '1' }, 'pressed: "Importing 1 partner…", busy, disabled, full colour, at once');
ok(/up to a minute/.test(await page.locator('.dk-sending').textContent()), 'and a line saying it can take a while');
await page.waitForURL(/done=imported/, { timeout: 30000 });
await page.waitForLoadState('networkidle');
ok((await flash()).startsWith('Imported.'), 'then "Imported."');
eq(await state(IMPORT), { text: 'Import', busy: null, disabled: true, opacity: '0.45' }, 'and a fresh form: the last file’s button doesn’t linger');
eq(await page.locator('.dk-table').count(), 0, 'nor its preview');
eq(await page.locator('.dk-sending').count(), 0, 'nor the waiting line');
const T = sql1(`select id from outreach_targets where import_key = ${q(`${MARK}-imp`)}`)?.id;
ok(T, 'the partner is in');

await page.setInputFiles('input[name=file]', file);
await page.waitForSelector('.dk-table');
await page.click(IMPORT);
await page.waitForURL(/done=import_nothing_new/, { timeout: 30000 });
ok((await flash()).startsWith('Nothing new'), 'the same file again: "Nothing new: every partner in that file is already in the desk."');

// ---------------------------------------------------------------------------------------------------------- a note
await page.goto(`${BASE}/admin/desk/t/${T}`, { waitUntil: 'networkidle' });
await page.click('#add-note summary');
await page.fill('#add-note textarea[name=body]', `${MARK} a note`);
const SAVE_NOTE = '#add-note button[type=submit]';
await page.click(SAVE_NOTE);
await page.waitForSelector(`${SAVE_NOTE}[aria-busy=true]`, { timeout: 1000 });
eq((await state(SAVE_NOTE)).text, 'Saving…', 'Save note: "Saving…" while it goes');
await page.waitForURL(/done=/, { timeout: 30000 });
eq(sql1(`select count(*)::int n from outreach_notes where target_id = ${q(T)} and body = ${q(`${MARK} a note`)}`).n, 1, 'saved once');

// ---------------------------------------------------------------------------------------------- Done and Drop
await page.waitForLoadState('networkidle');
const form = page.locator(`form:has(button[value=done])`).first();
await form.locator('button[value=done]').click();
await page.waitForSelector('button[value=done][aria-busy=true]', { timeout: 1000 });
const [d, x] = await Promise.all([state('form:has(button[aria-busy=true]) button[value=done]'), state('form:has(button[aria-busy=true]) button[value=cancel]')]);
eq({ done: d.text, doneDisabled: d.disabled, drop: x.text, dropDisabled: x.disabled, dropBusy: x.busy }, { done: 'Saving…', doneDisabled: true, drop: 'Drop', dropDisabled: true, dropBusy: null },
  'Done pressed: Done says "Saving…", Drop keeps its word, both disabled');
await page.waitForURL(/done=action_done/, { timeout: 30000 });
eq(sql1(`select count(*)::int n from outreach_actions where target_id = ${q(T)} and status = 'done'`).n, 1, 'one action point done, once');

await browser.close();
exec(`delete from outreach_targets where import_key like ${q(`${MARK}%`)}`);
fs.rmSync(dir, { recursive: true, force: true });
done();
