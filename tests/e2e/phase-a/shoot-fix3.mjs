// Fixer 3: pictures of every admin screen this fix round changed, at 320, 390, 768 and 1280, for looking at
// next to the r2b boards. Not a check (run-all skips it): node tests/e2e/phase-a/shoot-fix3.mjs [outDir]
// Needs a build of this branch on PHASE_A_BASE and the f3. seed (seed.mjs --prefix f3.).
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import { action, adminSession, exec, fakePay, q, rand, stripe, svc, BASE } from './lib.mjs';

const OUT = process.argv[2] || '/home/claude/build-a/shots/fix3';
fs.mkdirSync(OUT, { recursive: true });
const RUN = rand();
const admin = await adminSession('f3.');

async function member(name, fields = {}) {
  const email = `f3.t-shot-${rand()}@example.com`;
  const { data } = await svc.auth.admin.createUser({ email, email_confirm: true });
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  await svc.from('members').upsert({ id: data.user.id, email, full_name: name, phone: '+447911123456', membership_status: 'active', stripe_customer_id: c.json.id, stripe_subscription_id: s.json.id, ...fields });
  return { id: data.user.id, email, customer: c.json.id };
}
async function application(name, pm = `pm_f3_${rand()}`) {
  const email = `f3.t-shotapp-${rand()}@example.com`;
  const c = await stripe('POST', 'customers', { email, name });
  const { data } = await svc.from('applications').insert({ full_name: name, email, phone: '+447911123456', employer: 'Example Ltd', role_title: 'Analyst', linkedin_url: 'https://www.linkedin.com/in/example', instagram_username: 'example', stripe_customer_id: c.json.id, stripe_payment_method_id: pm }).select('id').single();
  return data.id;
}
async function event(title, hours = 24 * 12) {
  const { data } = await svc.from('events').insert({ slug: `f3-shot-${rand()}`, title, description: 'Fixer 3 shot', category: 'sport', location: 'Northgate Courts', start_time: new Date(Date.now() + hours * 3600000).toISOString(), price_pence: 2500, capacity: 16 }).select('id').single();
  await svc.from('event_addresses').upsert({ event_id: data.id, address: 'Northgate Courts, 1 Sample Road, Anytown AB1 2CD' });
  return data.id;
}
async function booking(m, eventId) {
  const r = await stripe('POST', 'payment_intents', { amount: 2500, currency: 'gbp', customer: m.customer, metadata: { member_id: m.id, event_id: eventId } });
  await fakePay(r.json.id, 'http://127.0.0.1:9/none');
  await svc.from('bookings').insert({ member_id: m.id, event_id: eventId, status: 'confirmed', amount_pence: 2500, stripe_payment_intent_id: r.json.id });
}

// Fixtures: a member with a paid booking (Delete), a deleted member, a stuck card, an event moved without the
// email, a paused member cancelled behind the page's back (Nothing changed), an application approved behind it.
const sam = await member('Sam Taylor');
const ev = await event('Padel & Pints');
await booking(sam, ev);
const gone = await member('Dana Gone');
await action('admin.members.deleteMember', [gone.id], admin);
const stuck = await application('Kit Barrow', `pm_fail_shot_${RUN}`);
await action('admin.applications.declineApplication', [stuck, { sendEmail: true }], admin);
const waiting = await application('Hannah Price');
const moved = await event('Polo Lesson');
await booking(await member('Marcus Reed'), moved);
await booking(await member('Chloe Webb'), moved);
await action('admin.events.updateEventDetails', [{ $formData: { event_id: moved, title: 'Polo Lesson', category: 'sport', location: 'Riverside Club', address: 'Riverside Club, 9 Sample Walk, Anytown AB1 2CD', start_time: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + 12 * 86400000)).replace(' ', 'T'), capacity: '16', price_pounds: '25' } }], admin);
exec(`update events set change_emailed_at = null where id = ${q(moved)}`);

const browser = await chromium.launch();
const shots = [];
for (const width of [320, 390, 768, 1280]) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await loginAdmin(page, BASE, adminCreds('f3.'));
  const go = async (p) => {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => Object.keys(b).some((k) => k.startsWith('__react'))));
  };
  const shot = async (name, full = true) => {
    const file = `${OUT}/${name}-${width}.png`;
    await page.screenshot({ path: file, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    shots.push({ name, width, overflow });
  };
  await go(`/admin/members/${sam.id}`);
  await page.getByRole('button', { name: 'Delete member', exact: true }).click();
  await page.getByTestId('dialog-delete-member').waitFor();
  await shot('delete-member-dialog', false);
  await page.keyboard.press('Escape');
  await go(`/admin/members/${gone.id}`);
  await shot('deleted-member-card');
  await go(`/admin/applications/${stuck}`);
  await shot('declined-card-not-removed');
  await go(`/admin/applications/${stuck}?done=was-declined`);
  await shot('was-declined');
  await go(`/admin/applications/${waiting}`);
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.getByTestId('dialog-decline').getByRole('button', { name: 'Read the email' }).click();
  await page.getByTestId('dialog-decline').locator('.ad-hint').last().scrollIntoViewIfNeeded();
  await shot('decline-dialog-note', false);
  await page.keyboard.press('Escape');
  await go('/admin/applications?tab=all');
  await shot('applications-all');
  await go(`/admin/events/${moved}`);
  await page.getByRole('button', { name: 'Email them now' }).scrollIntoViewIfNeeded();
  await shot('event-not-told', false);
  const paused = await member(`Pat Paused ${width}`, { membership_status: 'paused', paused_at: new Date().toISOString() });
  await go(`/admin/members/${paused.id}`);
  await action('admin.memberStatus.adminCancelMemberNow', [paused.id, { stripe: false }], admin);
  await page.getByRole('button', { name: 'Resume membership', exact: true }).click();
  await page.getByTestId('dialog-resume').getByRole('button', { name: 'Resume membership' }).click();
  await page.getByText('Nothing changed.').waitFor();
  await page.getByText('Cancelled is final.', { exact: false }).waitFor();
  await page.getByText('Nothing changed.').scrollIntoViewIfNeeded();
  await shot('stale-resume', false);
  await context.close();
}
// The reset page's code step, as an admin who followed the link.
const rctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const link = await svc.auth.admin.generateLink({ type: 'recovery', email: JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-f3r.json', 'utf8')).email });
for (const width of [320, 390, 768, 1280]) {
  const rp = await rctx.newPage();
  await rp.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  if (width === 320) {
    await rp.goto(`${BASE}/admin/reset-confirm?token_hash=${link.data.properties.hashed_token}&type=recovery`, { waitUntil: 'networkidle' });
    await rp.getByRole('button', { name: 'Continue' }).click();
    await rp.getByRole('heading', { name: 'Enter your code' }).waitFor();
    await rp.fill('#reset-code', '000000');
    await rp.getByRole('button', { name: 'Verify code' }).click();
    await rp.getByText('That code is incorrect or has expired. Try again.').waitFor();
    globalThis.resetPage = rp;
  }
  const page = globalThis.resetPage;
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.screenshot({ path: `${OUT}/reset-code-step-${width}.png`, fullPage: true });
  shots.push({ name: 'reset-code-step', width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
  if (rp !== page) await rp.close();
}
await browser.close();
exec(`update events set cancelled_at = now() where id in (${[ev, moved].map(q).join(',')})`);
console.log(JSON.stringify(shots.filter((s) => s.overflow)));
console.log(`${shots.length} pictures in ${OUT}; sideways overflow: ${shots.filter((s) => s.overflow).length}`);
