// Open Invite > Browse shows only plans the member can still join (Albert, 8 Nov 2026): a full plan, a plan you
// are in and a plan you posted are in Yours, not Browse; the card you join stays while "You're in." is open, then
// goes; a full plan comes back to Browse when a place opens; with plans about but none to join, Browse says so and
// points to Yours. Same server as 10-open-invite.mjs (the stage 2 switches on).
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/16-browse-joinable.mjs
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, done, eq, exec, makeMemberWithPhoto, ok, postPlan, q, rand, sql1 } from './lib.mjs';

const r = rand();
const title = `Browse rule ${r}`;
const [host, a, b, z] = await Promise.all(['bhost', 'bari', 'bben', 'bzed'].map((name) => makeMemberWithPhoto(`${name}${r}`)));
// Two places, the host going: one place left.
const planId = await postPlan(host, { title, places: 2, hostGoing: true });

const browser = await chromium.launch();
async function as(member) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host_ = new URL(BASE).hostname;
  await context.addCookies(cookieFor(member.session).split('; ').map((p) => {
    const i = p.indexOf('=');
    return { name: p.slice(0, i), value: p.slice(i + 1), domain: host_, path: '/' };
  }));
  const page = await context.newPage();
  return { context, page };
}
const card = (page, t = title) => page.locator('article.oi-card', { has: page.getByRole('heading', { name: t, exact: true }) });
const browse = async (page) => {
  await page.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
  await page.locator('main:not([aria-busy="true"]) h1').first().waitFor();
};
const yours = async (page) => {
  await page.goto(`${BASE}/members/open-invite/yours`, { waitUntil: 'networkidle' });
  await page.locator('main:not([aria-busy="true"]) h1').first().waitFor();
};

// ---------------------------------------------------------------- your own plan: Yours, not Browse
const H = await as(host);
await browse(H.page);
eq(await card(H.page).count(), 0, 'own plan: not in Browse');
await yours(H.page);
ok(await card(H.page).first().isVisible(), 'own plan: in Yours');

// ---------------------------------------------------------------- join: the card stays while "You're in." is open, then goes
const A = await as(a);
await browse(A.page);
eq(await card(A.page).getAttribute('data-state'), 'open', 'open plan: in Browse');
await card(A.page).getByRole('button', { name: 'I’m in' }).click();
await A.page.getByRole('dialog').getByRole('heading', { name: 'You’re in.' }).waitFor();
ok(await card(A.page).isVisible(), 'joined: the card stays while "You’re in." is open');
await A.page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
await A.page.getByRole('dialog').waitFor({ state: 'detached' });
await A.page.waitForTimeout(500);
eq(await card(A.page).count(), 0, 'joined: off Browse once the sheet closes');
await browse(A.page);
eq(await card(A.page).count(), 0, 'joined: still off Browse after a reload');
await yours(A.page);
ok(await card(A.page).first().isVisible(), 'joined: in Yours');

// ---------------------------------------------------------------- full: off Browse for everyone else
eq(sql1(`select count(*)::int n from plan_members where plan_id = ${q(planId)} and status = 'going'`).n, 2, 'the plan is full (2 of 2)');
const B = await as(b);
await browse(B.page);
eq(await card(B.page).count(), 0, 'full: not in Browse for someone not in it');
await B.page.goto(`${BASE}/members/open-invite/${planId}`, { waitUntil: 'networkidle' });
ok(await B.page.getByText('All places are taken.').first().isVisible(), 'full: its page still opens from a link (Full)');

// ---------------------------------------------------------------- a place opens: back in Browse
await A.page.goto(`${BASE}/members/open-invite/${planId}`, { waitUntil: 'networkidle' });
await A.page.locator('.oi-tail').getByRole('button', { name: 'Withdraw from this plan' }).click();
await A.page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
await A.page.getByRole('dialog').waitFor({ state: 'detached' });
await browse(B.page);
eq(await card(B.page).getAttribute('data-state'), 'open', 'a place opened: back in Browse');
await browse(A.page);
ok(await card(A.page).isVisible(), 'withdrawn: back in Browse for the one who left too');

// ---------------------------------------------------------------- plans about, none to join: says so, points to Yours
const Z = await as(z);
await postPlan(z, { title: `Zed's own ${r}` });
exec(`insert into blocks (blocker_id, blocked_id) select distinct ${q(z.id)}::uuid, host_id from plans where status = 'scheduled' and starts_at > now() and host_id <> ${q(z.id)} on conflict do nothing`);
await browse(Z.page);
ok(await Z.page.getByRole('heading', { name: /Nothing new/ }).first().isVisible(), 'none to join: "Nothing new to join."');
eq(await Z.page.locator('main a', { hasText: 'See Yours' }).first().getAttribute('href'), '/members/open-invite/yours', 'none to join: "See Yours"');
eq(await Z.page.getByText('Be the first.', { exact: false }).count(), 0, 'none to join: not "Be the first"');
exec(`delete from blocks where blocker_id = ${q(z.id)}`);

await browser.close();
done();
