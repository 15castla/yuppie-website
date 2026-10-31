// The admin Reports and Photos queues through the real pages (brief 2.5; v3 msg-admin-moderation-1280,
// msg-admin-photo-report-1280, photo-admin-*, framed in r2b 19), logged in through /admin/login (password, then
// the authenticator code) on a production build, against the local stack:
//   the nav's Reports and Photos counts and the dashboard rows (the queue numbers, the 24-hour promise);
//   Reports: a message report (the message in its chat) -> Remove message: gone for members ("Message removed");
//            a photo report -> Remove photo with a reason: the member meets the gate, the reason, the email;
//            a plan report -> Remove plan: off Open Invite, the people going get an Update;
//            a member report -> Suspend with the Stripe box (stage 1's pause): the member's gate, Stripe paused;
//            Dismiss; the Done tab; every action an audit row;
//   Photos: a "Use it anyway" photo -> Keep photo; a changed photo (Before and Now) -> Remove and ask for a new
//           one; a reported photo -> Keep closes the report;
//   refusals (QA2-01, extended to the new pages and actions): no session, an aal1 admin and a member are refused
//           on every new page (normal and RSC requests) and every new action, and nothing changes.
//   PHASE_B_BASE=http://localhost:3246 PHASE_B_TAG=ba. node tests/e2e/phase-b/13-admin.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, jwtClaims, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import {
  ANON, BASE, PREFIX, SUPA, action, adminSession, cookieFor, done, emailsTo, eq, exec, fakeState, fakesMark, fakesSince, logRows,
  makeMember, makeMemberWithPhoto, memberSession, ok, page as getPage, postPlan, q, rand, redirectedTo, sql, sql1, waitFor,
} from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const RUN = rand();
const MARK = `Q${RUN}`; // in every name and word this script makes: a refused reply that holds it has leaked data
const since = new Date().toISOString();
const ALERTS = process.env.ADMIN_ALERTS_EMAIL;
const ADMIN = JSON.parse(fs.readFileSync(`/home/claude/stack/tools/admin-${PREFIX}json`, 'utf8'));
const admin = await adminSession(PREFIX);
const FIX = '/home/claude/stack/tools/fixtures';
const photoFile = (name) => ({ name, type: 'image/jpeg', base64: fs.readFileSync(`${FIX}/${name}`).toString('base64') });
const upload = (session, face) => action('photo.uploadMyPhoto', [{ $formData: face ? { face } : {}, $files: { photo: photoFile('photo-480.jpg') } }], session).then((r) => r.result);
const audited = (actionName, targetId) => sql(`select admin_id from admin_audit where action = ${q(actionName)} and target_id = ${q(targetId)} and created_at >= ${q(since)}`);

// ---------------------------------------------------------------- people, a plan, a chat
const who = async (n) => {
  const m = await makeMemberWithPhoto(`${MARK.toLowerCase()}${n}`);
  return { ...m, first: `${MARK}${n}` };
};
const host = await who('h');
const bad = await who('b');
const rep1 = await who('r');
const rep2 = await who('s');
const PLAN = `${MARK} walk`;
const planId = await postPlan(host, { title: PLAN, places: 8, where: 'Calder Park' });
const chatId = (await action('invite.joinOpenInvite', [planId], bad.session)).result.chatId;
await action('invite.joinOpenInvite', [planId], rep1.session);
await action('invite.joinOpenInvite', [planId], rep2.session);
const say = async (m, text) => (await action('thread.sendMessage', [{ chatId, text, clientId: `ba-${rand()}` }], m.session)).result.message.id;
await say(host, `Meet at the gate ${MARK}`);
await say(rep1, 'See you there');
const BAD_WORDS = `Easier if you just send me the money ${MARK}`;
const badMsg = await say(bad, BAD_WORDS);
await say(rep2, 'That is odd');
await say(host, 'Keep it in the app');
const report = (m, draft) => action('messages.sendReport', [draft], m.session).then((r) => r.result);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London' });
const pg = await context.newPage();
pg.setDefaultTimeout(30000);
async function open(p) {
  await pg.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => Object.keys(b).some((k) => k.startsWith('__react'))), null, { timeout: 30000 });
}
const card = () => pg.locator('.ad-card-col .ad-card');
const row = (kind, id) => pg.locator(`a.ad-qi[href^="/admin/${kind}/${id}"]`);
const btn = (name, scope = pg) => scope.getByRole('button', { name, exact: true });
/** A number on screen against the database, read either side of it (other agents add reports and photos while this runs). */
async function sameAsDb(label, read, dbCount) {
  for (let i = 0; i < 4; i += 1) {
    const before = dbCount();
    const shown = await read();
    const after = dbCount();
    if (before === after && shown === before) return ok(true, `${label} (${shown})`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  ok(false, label, { shown: await read(), db: dbCount() });
}
const openReports = () => sql1(`select count(*)::int n from reports where status = 'open'`).n;
const photosToCheck = () =>
  sql1(`select (select count(*) from member_photos where status = 'pending') + (select count(distinct p.id) from member_photos p join reports r on r.photo_id = p.id where r.status = 'open' and p.status = 'approved' and (r.kind = 'photo' or (r.kind = 'member' and r.reason = 'photo_not_them_or_unsuitable')))::int n`).n;

try {
  const login = await loginAdmin(pg, BASE, adminCreds(PREFIX));
  eq(login.aal, 'aal2', '/admin/login: password, then the authenticator code, reaches aal2');

  // ======================================================================== a message report: Remove message
  const mark = fakesMark();
  const r1 = await report(rep1, { target: { kind: 'message', chatId, messageId: badMsg }, reason: 'pay_outside' });
  ok(r1.ok && !r1.duplicate, 'a member reports a message');
  await waitFor(() => logRows(`report_id = ${q(r1.reportId)} and template = 'admin-new-report' and status = 'sent' and to_address = ${q(ALERTS)}`).length === 1, 'the club gets the new report email (ADMIN_ALERTS_EMAIL)');

  // The nav and the dashboard.
  await open('/admin');
  const navText = await pg.locator('nav.ad-nav').innerText();
  ok(/Reports/.test(navText) && /Photos/.test(navText) && !/Payments/.test(navText), 'the nav gains Reports and Photos (Payments waits for paid plans)', navText);
  await sameAsDb('the nav count beside Reports is the open reports', async () => { await open('/admin'); return Number((await pg.locator('nav.ad-nav a[href="/admin/reports"] .n').innerText()).replace(/\D+/g, '')); }, openReports);
  await sameAsDb('the nav count beside Photos is the photos to check', async () => { await open('/admin'); return Number((await pg.locator('nav.ad-nav a[href="/admin/photos"] .n').innerText()).replace(/\D+/g, '')); }, photosToCheck);
  eq(await action('admin.reports.adminOpenReportCount', [], admin).then((r) => r.result) >= 1, true, 'the foundation’s own count agrees there is one open');
  const needRows = await pg.locator('.ad-need').allInnerTexts();
  ok(needRows.some((t) => /Reports to review/.test(t) && /Aim to reply within 24\./.test(t) && /Review reports/.test(t)), 'the dashboard: "Reports to review", the oldest open and the 24-hour aim, "Review reports"', needRows);
  ok(needRows.some((t) => /Photos to check/.test(t) && /Check photos/.test(t)), 'the dashboard: "Photos to check" with "Check photos"', needRows);

  // The list.
  await open('/admin/reports');
  ok((await pg.locator('h1').innerText()).trim() === 'Reports', 'Reports opens from the nav');
  const lead = await pg.locator('.ad-lead').innerText();
  ok(/aim to clear the list within 24 hours/.test(lead), 'the 24-hour promise in the lead', lead);
  const stats = await pg.locator('.ad-stats').innerText();
  ok(/REVIEW WITHIN\s*24 h/i.test(stats) && /OPEN REPORTS/i.test(stats) && /OLDEST OPEN/i.test(stats) && /REMOVED THIS MONTH/i.test(stats), 'the four numbers, with "Review within 24 h"', stats);
  ok(/^Open\s*\d+/.test((await pg.locator('.ad-tabs a[aria-current="page"]').innerText()).trim()), 'Open is the tab, with its count');
  const r1Row = await row('reports', r1.reportId).innerText();
  ok(r1Row.includes(`${bad.first} in ${PLAN}`) && r1Row.includes(BAD_WORDS) && r1Row.includes('Open') && r1Row.includes('Pressure to pay outside the app') && r1Row.includes(`Reported by ${rep1.first}`) && /min ago|Just now/.test(r1Row),
    'the row: who and where, the words reported, Open, the reason, who reported it, when', r1Row);
  ok(await row('reports', r1.reportId).locator('img[src*="/object/sign/member-photos/"]').count() === 1, 'with their photo from the private bucket (a signed link)');

  // The card.
  await row('reports', r1.reportId).click();
  await pg.waitForURL(`**/admin/reports/${r1.reportId}`);
  await card().getByText(`Message from ${bad.first}`).waitFor();
  const c1 = await card().innerText();
  ok(c1.includes('REPORTED BY') && c1.includes(`${rep1.first}, `) && c1.includes('Pressure to pay outside the app'), 'the card: reported by and the reason', c1);
  ok(new RegExp(`Plan chat, ${PLAN} \\(\\w{3} \\d{1,2} \\w{3}, \\d\\d:\\d\\d\\), 4 members`).test(c1), 'the chat: plan chat, the plan, its date and time, 4 members', c1);
  ok(new RegExp(`${bad.first} · member since \\w{3} \\d{4} · no earlier reports · blocked by 0 members`).test(c1), 'the member: since when, earlier reports, blocked by', c1);
  const ctx = await card().locator('.ad-ctx .l').allInnerTexts();
  eq(ctx.map((t) => t.replace(/^\d\d:\d\d\s*/, '').trim()), [`${host.first} Meet at the gate ${MARK}`, `${rep1.first} See you there`, `${bad.first} ${BAD_WORDS}`, `${rep2.first} That is odd`, `${host.first} Keep it in the app`], 'the message in its chat, two either side');
  eq(await card().locator('.ad-ctx .l.hit').innerText().then((t) => t.includes(BAD_WORDS)), true, 'the reported one outlined');
  const acts1 = await card().locator('.ad-acts button').allInnerTexts();
  eq(acts1, ['Remove message', `Suspend ${bad.first}`, 'Dismiss report'], 'the actions, Remove message first (no Warn: nothing would be sent)');
  ok(/Remove replaces the message with “Message removed” for everyone\./.test(await card().locator('.ad-qnote').innerText()), 'the note says what each does');
  await btn('Remove message', card()).click();
  await card().getByText('Message removed. Everyone in the chat sees “Message removed” now.').waitFor();
  ok(pg.url().includes('done=message_removed'), 'Remove message: the green line on the report’s own page');
  eq((await card().locator('.ad-qh .ad-pill').innerText()).trim(), 'Removed', 'the pill says Removed');
  ok(/OUTCOME\s*\n?\s*Message removed, Today, \d\d:\d\d/i.test(await card().innerText()), 'and the outcome with when');
  eq(await row('reports', r1.reportId).count(), 0, 'the report leaves the Open list');
  eq(sql1(`select status, acted_by from reports where id = ${q(r1.reportId)}`), { status: 'message_removed', acted_by: ADMIN.userId }, 'the database: message_removed, by this admin');
  ok(sql1(`select removed_at from messages where id = ${q(badMsg)}`).removed_at, 'the message is removed');
  eq(audited('report.message_removed', r1.reportId).map((a) => a.admin_id), [ADMIN.userId], 'an audit row');
  // For members: gone, in the thread they poll and on the real page.
  const seen = (await action('thread.getThread', [chatId], rep2.session)).result.items.find((i) => i.id === badMsg);
  eq([seen.status, seen.text], ['removed', ''], 'members: the thread says "Message removed" and not the words');
  const threadPage = await getPage(`/members/messages/${chatId}`, rep2.session);
  ok(threadPage.status === 200 && threadPage.text.includes('Message removed') && !threadPage.text.includes(BAD_WORDS), 'members: the chat page shows "Message removed", never the words', { status: threadPage.status });
  // The Done tab.
  await open('/admin/reports?tab=done');
  ok(await row('reports', r1.reportId).count() === 1 && (await row('reports', r1.reportId).innerText()).includes('Removed'), 'Done lists it, with Removed');
  eq(fakesSince(mark, 'email').filter((e) => (Array.isArray(e.to) ? e.to : [e.to]).includes(bad.email)).length, 0, 'nobody is emailed about a removed message (no design for that)');

  // ======================================================================== a photo report: Remove photo, with a reason
  const r2 = await report(rep2, { target: { kind: 'photo', chatId, memberId: bad.id }, reason: 'not_suitable' });
  ok(r2.ok, 'a member reports a photo');
  await open(`/admin/reports/${r2.reportId}`);
  await card().getByText(`Photo of ${bad.first}`).waitFor();
  const c2 = await card().innerText();
  ok(c2.includes('This is the photo members see.') && c2.includes('Only signed-in members can see it.') && new RegExp(`photo added \\w{3} \\d{1,2} \\w{3}`).test(c2), 'the card: the photo members see, when it was added', c2);
  ok(await card().locator('.ad-pic img[src*="/object/sign/member-photos/"]').count() === 1, 'the photo itself, through a signed link');
  eq(await card().locator('.ad-acts button').allInnerTexts(), ['Remove photo', `Suspend ${bad.first}`, 'Dismiss report'], 'Remove photo first');
  const markPhoto = fakesMark();
  await btn('Remove photo', card()).click();
  const dlg = pg.getByTestId('dialog-remove-photo');
  await dlg.waitFor();
  eq((await dlg.locator('h2').innerText()).trim(), `Remove ${bad.first}’s photo?`, 'the dialog: "Remove …’s photo?"');
  eq(await dlg.locator('.ad-rad').allInnerTexts(), ['Not a clear photo of you', 'Not a photo of the member', 'Not suitable for the club'], 'the three reasons');
  ok((await dlg.locator('.ad-willsee').innerText()).includes('We removed your photo because it wasn’t a clear photo of you. Please add a new one.'), 'what the member will see, for the first reason');
  await dlg.getByText('Not suitable for the club').click();
  ok((await dlg.locator('.ad-willsee').innerText()).includes('We removed your photo because it wasn’t suitable for the club. Please add a new one.'), 'and for the one picked');
  await btn('Remove and ask for a new one', dlg).click();
  await card().getByText(`Photo removed. ${bad.first} is asked for a new one and gets an email with the reason.`).waitFor();
  ok(true, 'Remove photo: the green line');
  eq(sql1(`select status, removal_reason, reviewed_by from member_photos where id = ${q(bad.photoId)}`), { status: 'removed', removal_reason: 'not_suitable', reviewed_by: ADMIN.userId }, 'the photo is removed, with the reason, by this admin');
  eq(sql1(`select photo_id from members where id = ${q(bad.id)}`).photo_id, null, 'it is no longer their photo');
  eq(sql1(`select status from reports where id = ${q(r2.reportId)}`).status, 'photo_removed', 'the report says photo removed');
  ok(audited('photo.remove', bad.photoId).length === 1 && audited('report.photo_removed', r2.reportId).length === 1, 'audit rows for the photo and the report');
  await waitFor(() => logRows(`member_id = ${q(bad.id)} and template = 'photo-removed' and status = 'sent'`).length === 1, 'the photo-removed email is sent');
  const mail = (await fakeState()).emails.filter((e) => (Array.isArray(e.to) ? e.to : [e.to]).includes(bad.email) && e.subject === 'We removed your photo').at(-1);
  ok(mail && `${mail.html}${mail.text}`.includes('because it wasn’t suitable for the club'), 'with the reason picked', mail?.subject);
  ok(fakesSince(markPhoto, 'email').some((e) => (Array.isArray(e.to) ? e.to : [e.to]).includes(bad.email)), 'through the email provider');
  eq(await redirectedTo('/members/open-invite', bad.session), '/members/photo', 'the member meets the photo gate at their next screen');
  const gate = (await action('photo.getMyPhotoGate', [], bad.session)).result;
  eq([gate.hasPhoto, gate.removed?.reason], [false, 'not_suitable'], 'the gate is told why (getMyPhotoGate: the reason the admin picked)');
  const gatePage = await getPage('/members/photo', bad.session);
  if (/We removed your/.test(gatePage.text)) ok(/suitable for the club/.test(gatePage.text), 'the gate page shows that reason');
  const inChat = (await action('thread.getThread', [chatId], rep1.session)).result;
  ok(!JSON.stringify(inChat).includes(bad.photoId) && !JSON.stringify(inChat).includes(`${bad.id}/test-`), 'the old photo’s link is in no chat any more');

  // ======================================================================== a plan report: Remove plan
  const host2 = await who('k');
  const g1 = await who('g');
  const g2 = await who('j');
  const outsider = await who('o');
  const PLAN2 = `${MARK} padel`;
  const plan2 = await postPlan(host2, { title: PLAN2, places: 4, where: 'Northgate Courts', note: `Bring a racket ${MARK}` });
  await action('invite.joinOpenInvite', [plan2], g1.session);
  await action('invite.joinOpenInvite', [plan2], g2.session);
  const r3 = (await action('invite.reportOpenInvite', [plan2, 'Not a real plan'], outsider.session)).result;
  ok(r3.ok, 'a member reports a plan');
  await open(`/admin/reports/${r3.reportId}`);
  await card().getByText(`Plan from ${host2.first}`).waitFor();
  const c3 = await card().innerText();
  ok(c3.includes('Not a real plan') && new RegExp(`HOST\\s*\\n?\\s*${host2.first} · member since`, 'i').test(c3), 'the card: the reason and the host', c3);
  ok(c3.includes(PLAN2) && c3.includes('Northgate Courts') && c3.includes('3 going of 4 places') && c3.includes(`Bring a racket ${MARK}`), 'the plan: title, when and where, going, the note', c3);
  eq(await card().locator('.ad-acts button').allInnerTexts(), ['Remove plan', `Suspend ${host2.first}`, 'Dismiss report'], 'Remove plan first');
  await btn('Remove plan', card()).click();
  const dlgPlan = pg.getByTestId('dialog-remove-plan');
  await dlgPlan.waitFor();
  const dlgPlanText = await dlgPlan.innerText();
  ok(dlgPlanText.includes(`Remove ${PLAN2}?`) && dlgPlanText.includes('The 2 people going see that it was cancelled in their Updates.') && dlgPlanText.includes('This can’t be undone.'), 'the dialog says who hears and that it can’t be undone', dlgPlanText);
  await btn('Remove plan', dlgPlan).click();
  await card().getByText('Plan removed. It’s off Open Invite and the people going have an Update.').waitFor();
  ok(true, 'Remove plan: the green line');
  eq(sql1(`select status, removed_by, removed_reason from plans where id = ${q(plan2)}`), { status: 'cancelled', removed_by: ADMIN.userId, removed_reason: 'Not a real plan' }, 'the plan is cancelled and marked removed by this admin');
  eq(sql1(`select status from reports where id = ${q(r3.reportId)}`).status, 'plan_removed', 'the report says plan removed');
  ok(audited('plan.remove', plan2).length === 1 && audited('report.plan_removed', r3.reportId).length === 1, 'audit rows for the plan and the report');
  for (const g of [g1, g2]) {
    const ups = (await action('messages.getUpdates', [], g.session)).result;
    ok(ups.some((u) => u.kind === 'cancelled' && u.plan?.id === plan2 && !u.actor), `the people going are told: an Update for ${g.first} (no host named: the club removed it)`);
  }
  ok(!(await action('invite.getOpenInviteFeed', [], outsider.session)).result.invites.some((i) => i.id === plan2), 'it leaves the feed');
  eq((await action('plan.getOpenInvitePage', [plan2], outsider.session)).result, null, 'its page is gone for anyone not going');

  // ======================================================================== a member report: Suspend, with the Stripe box
  const r4 = await report(rep1, { target: { kind: 'member', chatId, memberId: rep2.id }, reason: 'harassment' });
  await open(`/admin/reports/${r4.reportId}`);
  await card().getByText(`Report about ${rep2.first}`).waitFor();
  eq(await card().locator('.ad-acts button').allInnerTexts(), [`Suspend ${rep2.first}`, 'Dismiss report'], 'a member report: Suspend first');
  const markStripe = fakesMark();
  await btn(`Suspend ${rep2.first}`, card()).click();
  const dlgS = pg.getByTestId('dialog-suspend');
  await dlgS.waitFor();
  ok((await dlgS.innerText()).includes(`Also pause ${rep2.first}’s £10 a month payments in Stripe`) && (await dlgS.locator('input[type=checkbox]').isChecked()), 'the dialog asks about Stripe, ticked (B-D2)');
  await btn(`Suspend ${rep2.first}`, dlgS).click();
  await card().getByText(`${rep2.first} is suspended. To lift it, resume the membership in Members.`).waitFor();
  ok(await card().getByRole('link', { name: `Open ${rep2.first} in Members` }).count() === 1, 'Suspend: the green line and a link to the member');
  eq(sql1(`select membership_status from members where id = ${q(rep2.id)}`).membership_status, 'paused', 'the member is paused (stage 1’s path)');
  const pauseCall = fakesSince(markStripe, 'stripe').find((l) => l.path === `/v1/subscriptions/${rep2.subscription}` && l.method === 'POST');
  eq(pauseCall?.body?.pause_collection, { behavior: 'void' }, 'Stripe: payments paused');
  eq(sql1(`select status from reports where id = ${q(r4.reportId)}`).status, 'suspended', 'the report says suspended');
  ok(audited('member.pause', rep2.id).length === 1 && audited('report.suspended', r4.reportId).length === 1, 'audit rows for the pause and the report');
  eq(await redirectedTo('/members/open-invite', rep2.session), '/members/membership', 'the member sees the paused gate and nothing else');
  await open(`/admin/members/${rep2.id}`);
  ok((await card().innerText()).includes('Payments are paused in Stripe.'), 'Members shows the pause, ready to resume');

  // ======================================================================== Dismiss; the 24-hour promise
  const r5 = await report(rep1, { target: { kind: 'member', chatId, memberId: host.id }, reason: 'rude' });
  exec(`update reports set created_at = now() - interval '30 hours' where id = ${q(r5.reportId)}`);
  await open('/admin/reports');
  const oldest = sql1(`select floor(extract(epoch from now() - min(created_at)) / 3600)::int h from reports where status = 'open'`).h;
  const oldestStat = pg.locator('.ad-stat').filter({ hasText: /Oldest open/i }).locator('dd');
  eq([await oldestStat.innerText(), await oldestStat.getAttribute('class')], [`${oldest} h`, 'late'], 'past 24 hours, the oldest open shows in red');
  await open('/admin');
  ok((await pg.locator('.ad-need').filter({ hasText: 'Reports to review' }).innerText()).includes(`Oldest open ${oldest} hours. Aim to reply within 24.`), 'and the dashboard says how old');
  await open(`/admin/reports/${r5.reportId}`);
  await btn('Dismiss report', card()).click();
  await card().getByText('Report dismissed. Nothing else changed.').waitFor();
  eq(sql1(`select status from reports where id = ${q(r5.reportId)}`).status, 'dismissed', 'Dismiss: the report is dismissed');
  ok(audited('report.dismissed', r5.reportId).length === 1, 'an audit row');
  eq(sql1(`select membership_status from members where id = ${q(host.id)}`).membership_status, 'active', 'and nothing else changed');

  // A report someone else dealt with meanwhile: a plain sentence, nothing changes.
  const r6 = await report(rep1, { target: { kind: 'member', chatId, memberId: host.id }, reason: 'spam' });
  await open(`/admin/reports/${r6.reportId}`);
  await action('admin.reports.adminDismissReport', [r6.reportId], admin);
  await btn('Dismiss report', card()).click();
  await card().getByText('Someone dealt with this report already. The outcome is above.').waitFor();
  ok((await card().innerText()).includes('Nothing changed.') && pg.url().includes('stale=1'), 'acting on a report another admin closed: "Nothing changed." and what was done');

  // ======================================================================== Photos: a "Use it anyway" photo, Keep
  // A member with no photo yet (the gate), so theirs is a New one.
  const freshM = await makeMember(`${MARK.toLowerCase()}n`);
  const fresh = { ...freshM, first: `${MARK}n`, session: await memberSession(freshM.email) };
  const up1 = await upload(fresh.session, 'none');
  ok(up1.success, 'a member saves a photo with no face found ("Use it anyway")');
  await open('/admin/photos');
  eq((await pg.locator('h1').innerText()).trim(), 'Photos', 'Photos opens');
  ok(/aim to clear the list within 24 hours/i.test(await pg.locator('.ad-lead').innerText()), 'with the 24-hour aim');
  const pStats = await pg.locator('.ad-stats').innerText();
  ok(/TO CHECK/i.test(pStats) && /REPORTED/i.test(pStats) && /OLDEST WAITING/i.test(pStats) && /REMOVED THIS MONTH/i.test(pStats), 'the four numbers', pStats);
  await sameAsDb('"To check" is the photos to check', async () => { await open('/admin/photos'); return Number((await pg.locator('.ad-stat').first().locator('dd').innerText()).trim()); }, photosToCheck);
  const fRow = await row('photos', up1.photoId).innerText();
  ok(fRow.includes(fresh.first) && fRow.includes('New') && fRow.includes('New photo, no face found'), 'the row: name, New, "New photo, no face found"', fRow);
  await row('photos', up1.photoId).click();
  await pg.waitForURL(`**/admin/photos/${up1.photoId}`);
  await card().getByText(`Photo from ${fresh.first}`).waitFor();
  const pc = await card().innerText();
  ok(pc.includes('No face found') && pc.includes(`${fresh.first} chose “Use it anyway” when we asked`) && /ADDED\s*\n?\s*Today, \d\d:\d\d/i.test(pc), 'the card: no face found, the "Use it anyway" note, when', pc);
  ok(await card().locator('.ad-pics img[src*="/object/sign/member-photos/"]').count() === 1, 'the photo at 176, signed');
  await btn('Keep photo', card()).click();
  await card().getByText(`Photo kept. Nothing changes for ${fresh.first}.`).waitFor();
  eq(sql1(`select status, reviewed_by from member_photos where id = ${q(up1.photoId)}`), { status: 'approved', reviewed_by: ADMIN.userId }, 'Keep photo: approved by this admin');
  ok(audited('photo.keep', up1.photoId).length === 1, 'an audit row');
  eq(await row('photos', up1.photoId).count(), 0, 'it leaves To check');
  eq(sql1(`select photo_id from members where id = ${q(fresh.id)}`).photo_id, up1.photoId, 'and it stays their photo');
  await open('/admin/photos?tab=done');
  ok((await row('photos', up1.photoId).innerText()).includes('Kept'), 'Done lists it as Kept');

  // ======================================================================== Photos: a changed photo (Before and Now), Remove
  const changer = await who('c');
  const up2 = await upload(changer.session, 'found');
  ok(up2.success && sql1(`select source, previous_photo_id from member_photos where id = ${q(up2.photoId)}`).previous_photo_id === changer.photoId, 'a member changes their photo');
  await open(`/admin/photos/${up2.photoId}`);
  await card().getByText(`New photo from ${changer.first}`).waitFor();
  eq(await card().locator('figcaption').allInnerTexts(), ['BEFORE', 'NOW'], 'the card: Before and Now');
  eq(await card().locator('.ad-pics img[src*="/object/sign/member-photos/"]').count(), 2, 'both signed');
  ok((await card().innerText()).includes('Face found') && /CHANGED\s*\n?\s*Today/i.test(await card().innerText()), 'face found, changed today');
  const markC = fakesMark();
  await btn('Remove and ask for a new one', card()).click();
  const dlgC = pg.getByTestId('dialog-remove-photo');
  await dlgC.waitFor();
  await btn('Remove and ask for a new one', dlgC).click();
  await card().getByText(`Photo removed. ${changer.first} is asked for a new one and gets an email with the reason.`).waitFor();
  eq(sql1(`select status, removal_reason from member_photos where id = ${q(up2.photoId)}`), { status: 'removed', removal_reason: 'not_clear' }, 'Remove: removed, "Not a clear photo of you"');
  eq(sql1(`select photo_id from members where id = ${q(changer.id)}`).photo_id, null, 'no photo now: the gate');
  ok(audited('photo.remove', up2.photoId).length === 1, 'an audit row');
  await waitFor(() => emailsTo(markC, changer.email).some((e) => e.subject === 'We removed your photo'), 'the photo-removed email');
  eq(await redirectedTo('/members/events', changer.session), '/members/photo', 'the member meets the gate');

  // ======================================================================== Photos: a reported photo, Keep closes the report
  const r7 = await report(rep1, { target: { kind: 'photo', chatId, memberId: host.id }, reason: 'not_them' });
  await open('/admin/photos');
  const repRow = await row('photos', host.photoId).innerText();
  ok(repRow.includes('Reported') && repRow.includes(`Reported by ${rep1.first}: It isn’t them`), 'a reported photo: Reported, by whom and why', repRow);
  const order = await pg.locator('a.ad-qi').evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.querySelector('.ad-pill')?.textContent]));
  const hostAt = order.findIndex(([h]) => h.includes(host.photoId));
  const firstUnreported = order.findIndex(([, pill]) => pill !== 'Reported');
  ok(hostAt >= 0 && (firstUnreported === -1 || hostAt < firstUnreported), 'reported photos are at the top', order.slice(0, 12));
  await open(`/admin/photos/${host.photoId}`);
  const hc = await card().innerText();
  ok(hc.includes('REPORTED BY') && hc.includes(`${rep1.first}, `) && hc.includes('It isn’t them'), 'the card: who reported it and why', hc);
  await btn('Keep photo', card()).click();
  await card().getByText(`Photo kept. Nothing changes for ${host.first}.`).waitFor();
  eq(sql1(`select status, action_note from reports where id = ${q(r7.reportId)}`), { status: 'dismissed', action_note: 'photo kept' }, 'Keep photo closes the report about it');

  // ======================================================================== the layout at every width
  for (const p of ['/admin/reports', `/admin/reports/${r3.reportId}`, '/admin/photos', `/admin/photos/${up2.photoId}`, '/admin']) {
    for (const w of [320, 390, 430, 768, 1024, 1280]) {
      await pg.setViewportSize({ width: w, height: 900 });
      await pg.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
      const over = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) ok(false, `${p} at ${w}: nothing scrolls sideways`, { over });
    }
  }
  ok(true, 'no page scrolls sideways at 320, 390, 430, 768, 1024 or 1280');
  await pg.setViewportSize({ width: 390, height: 900 });
  await open('/admin/reports');
  ok(await pg.locator('.ad-list-col').isVisible() && await pg.locator('.ad-card-col .ad-card').isVisible() && !(await pg.locator('.ad-card-col > .ad-back').isVisible()), 'on a phone the list stacks above the card, no Back link (B-D22 A)');
  await pg.setViewportSize({ width: 1280, height: 900 });

  // ======================================================================== QA2-01 for the new pages and actions
  async function passwordSession(email, password) {
    const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return r.json();
  }
  const aal1 = await passwordSession(ADMIN.email, 'local-admin-password-1');
  eq(jwtClaims(aal1.access_token).aal, 'aal1', 'an admin with the password only has an aal1 session');
  const REFUSED = [['no session', ''], ['admin aal1', cookieFor(aal1)]];
  const memberCookie = cookieFor(rep1.session);
  // An open report and a waiting photo, for the refused calls to aim at.
  const openRep = await report(rep1, { target: { kind: 'message', chatId, messageId: await say(host, `One more ${MARK}`) }, reason: 'spam' });
  const waiting = await who('w');
  const waitingPhoto = (await upload(waiting.session, 'found')).photoId;
  const leaks = (body) => body.includes(MARK) || /@example\.com|Logged in as/.test(body);
  const toLogin = (r) => (r.status === 307 && /\/admin\/login$/.test(new URL(r.location ?? '/', BASE).pathname)) || /NEXT_REDIRECT;(replace|push);\/admin\/login;/.test(r.body);
  const toHome = (r) => (r.status === 307 && new URL(r.location ?? '/x', BASE).pathname === '/') || /NEXT_REDIRECT;(replace|push);\/;/.test(r.body);
  async function get(p, cookie, headers = {}) {
    let r = await fetch(`${BASE}${p}`, { redirect: 'manual', headers: { ...headers, Cookie: cookie } });
    if (headers.RSC && r.status === 307 && /_rsc=/.test(r.headers.get('location') ?? '')) r = await fetch(new URL(r.headers.get('location'), BASE), { redirect: 'manual', headers: { ...headers, Cookie: cookie } });
    return { status: r.status, location: r.headers.get('location'), body: await r.text() };
  }
  // The marker: something only the real page carries (the index pages' card is whichever report or photo is first).
  const pages = [
    ['/admin/reports', /ad-qh/],
    ['/admin/reports?tab=done', /ad-qh/],
    [`/admin/reports/${openRep.reportId}`, MARK],
    ['/admin/photos', /ad-qh/],
    ['/admin/photos?tab=done', /ad-qh/],
    [`/admin/photos/${waitingPhoto}`, MARK],
  ];
  for (const [p] of pages) {
    for (const [label, cookie] of REFUSED) {
      const r = await get(p, cookie);
      ok(toLogin(r) && !leaks(r.body), `QA2-01 ${p}, ${label}: sent to Log in, nothing of the page (${r.status})`, { status: r.status, location: r.location, body: r.body.slice(0, 300) });
    }
    const m = await get(p, memberCookie);
    ok(toHome(m) && !leaks(m.body), `QA2-01 ${p}, a member’s session: sent home, nothing of the page`, { status: m.status, location: m.location });
  }
  // RSC requests as the router makes them: the page alone (its layouts claimed on screen already), from the
  // section's layout down, and the whole tree.
  function variant(tree, depth) {
    const copy = JSON.parse(JSON.stringify(tree));
    const chain = [];
    for (let node = copy; node; node = node[1]?.children) chain.push(node);
    for (const node of chain) node[3] = null;
    chain[depth < 0 ? chain.length + depth : depth][3] = 'refetch';
    return copy;
  }
  let rscChecks = 0;
  for (const [p, marker] of pages) {
    await open(p);
    const req = pg.waitForRequest((r) => Boolean(r.headers().rsc) && !r.headers()['next-router-prefetch'] && r.url().startsWith(`${BASE}${p.split('?')[0]}`));
    await pg.evaluate(() => window.next.router.refresh());
    const tree = JSON.parse(decodeURIComponent((await req).headers()['next-router-state-tree']));
    let depthOf = 0;
    for (let x = tree; x; x = x[1]?.children) depthOf += 1;
    const forms = { 'the page alone': variant(tree, -1), 'from the section layout': variant(tree, Math.min(3, depthOf - 1)), 'the whole tree': variant(tree, 0) };
    for (const [form, t] of Object.entries(forms)) {
      const headers = { RSC: '1', 'Next-Router-State-Tree': encodeURIComponent(JSON.stringify(t)), 'Next-Url': '/admin/reports' };
      for (const [label, cookie] of REFUSED) {
        const r = await get(p, cookie, headers);
        ok(toLogin(r) && !leaks(r.body), `QA2-01 RSC ${p} (${form}), ${label}: refused, nothing of the page`, { status: r.status, body: r.body.slice(0, 400) });
        rscChecks += 1;
      }
      const m = await get(p, memberCookie, headers);
      ok(toHome(m) && !leaks(m.body), `QA2-01 RSC ${p} (${form}), a member’s session: refused`, { status: m.status, body: m.body.slice(0, 300) });
    }
    const c = await get(p, cookieFor(admin), { RSC: '1', 'Next-Router-State-Tree': encodeURIComponent(JSON.stringify(forms['the page alone'])), 'Next-Url': '/admin/reports' });
    ok(c.status === 200 && (typeof marker === 'string' ? c.body.includes(marker) : marker.test(c.body)), `QA2-01 RSC ${p} (the page alone), aal2: the same request carries the page (the check above is real)`);
  }
  eq(rscChecks, pages.length * 6, `QA2-01 ${pages.length * 6} RSC requests refused`);

  // Every new action the admin pages can call, from the build's own manifest.
  const manifestFile = [`${ROOT}/.next/server/server-reference-manifest.json`, `${ROOT}/.next/dev/server/server-reference-manifest.json`].find((f) => fs.existsSync(f));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).node;
  const newActions = Object.entries(manifest)
    .map(([id, v]) => ({ id, name: v.exportedName, file: v.filename, worker: Object.keys(v.workers).find((w) => w.startsWith('app/admin')) }))
    .filter((a) => /^app\/admin\/(reports|photos)-actions\.ts$/.test(a.file) && a.worker);
  const ARGS = {
    adminDismissReport: [openRep.reportId],
    adminRemoveReportedMessage: [openRep.reportId],
    adminRemoveReportedPlan: [openRep.reportId, 'x'],
    adminRemoveReportedPhoto: [openRep.reportId, 'not_clear'],
    adminSuspendReportedMember: [openRep.reportId, { stripe: true }],
    adminWarnReportedMember: [openRep.reportId],
    adminGetReports: ['open'],
    adminGetReport: [openRep.reportId],
    adminOpenReportCount: [],
    adminKeepPhoto: [waitingPhoto],
    adminRemovePhoto: [waitingPhoto, 'not_clear'],
    adminGetPhotos: ['check'],
    adminPhotosToCheck: [],
    adminPhotoRemovalReasons: [],
  };
  // Every export of the two action files is reachable once a page imports one of them: each must refuse.
  ok(['adminDismissReport', 'adminKeepPhoto', 'adminRemovePhoto', 'adminRemoveReportedMessage', 'adminRemoveReportedPhoto', 'adminRemoveReportedPlan', 'adminSuspendReportedMember'].every((n) => newActions.some((a) => a.name === n)), 'QA2-01 the actions the Reports and Photos pages call are in the build', newActions.map((a) => a.name));
  eq(newActions.filter((a) => !ARGS[a.name]).map((a) => a.name), [], `QA2-01 every action in reports-actions.ts and photos-actions.ts (${newActions.length}) has a call in this check`);
  const urlOf = (worker) => worker.replace(/^app/, '').replace(/\/\([^)]+\)/g, '').replace(/\/page$/, '').replace(/\[[^\]]+\]/g, 'x') || '/';
  async function callAction(a, cookie) {
    const r = await fetch(`${BASE}${urlOf(a.worker)}`, { method: 'POST', redirect: 'manual', headers: { 'Next-Action': a.id, Accept: 'text/x-component', Cookie: cookie, Origin: BASE, 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(ARGS[a.name]) });
    return { status: r.status, redirect: r.headers.get('x-action-redirect') ?? r.headers.get('location'), body: await r.text() };
  }
  const snapshot = () => sql1(`select
    (select row_to_json(r) from (select status, acted_at from reports where id = ${q(openRep.reportId)}) r) as report,
    (select row_to_json(p) from (select status, reviewed_at from member_photos where id = ${q(waitingPhoto)}) p) as photo,
    (select row_to_json(m) from (select membership_status from members where id = ${q(host.id)}) m) as member,
    (select count(*) from messages where chat_id = ${q(chatId)} and removed_at is not null)::int as removed,
    (select count(*) from admin_audit where created_at >= ${q(since)} and admin_id = ${q(ADMIN.userId)} and target_id in (${q(openRep.reportId)}, ${q(waitingPhoto)}, ${q(host.id)}))::int as audits`);
  const before = snapshot();
  const stripeMark = fakesMark();
  for (const a of newActions) {
    for (const [label, cookie] of REFUSED) {
      const r = await callAction(a, cookie);
      ok(/^\/admin\/login/.test(r.redirect ?? '') && !leaks(r.body), `QA2-01 action ${a.name}, ${label}: refused (sent to Log in), nothing returned`, { status: r.status, redirect: r.redirect, body: r.body.slice(0, 300) });
    }
    const m = await callAction(a, memberCookie);
    ok(/^\/(;|$)/.test(m.redirect ?? '') && !leaks(m.body), `QA2-01 action ${a.name}, a member’s session: refused (sent home)`, { status: m.status, redirect: m.redirect });
  }
  eq(snapshot(), before, 'QA2-01 after every refused call: the report, the photo, the member, the chat and the audit are exactly as before');
  eq(fakesSince(stripeMark, 'stripe').filter((l) => l.method !== 'GET').length, 0, 'QA2-01 and nothing was written to Stripe');
  // Control: the same call with the aal2 session goes through.
  const ctl = await callAction(newActions.find((a) => a.name === 'adminDismissReport'), cookieFor(admin));
  ok(!ctl.redirect && sql1(`select status from reports where id = ${q(openRep.reportId)}`).status === 'dismissed', 'QA2-01 adminDismissReport with the aal2 cookie goes through (control)');
  ok(audited('report.dismissed', openRep.reportId).length === 1, 'with its audit row');

  // The nav and the dashboard counts after all this.
  await sameAsDb('the nav count beside Reports still matches', async () => { await open('/admin/reports'); return Number((await pg.locator('nav.ad-nav a[href="/admin/reports"] .n').innerText().catch(() => '0')).replace(/\D+/g, '') || 0); }, openReports);
} finally {
  await browser.close();
  // Leave the queue as it was: close what this run opened.
  exec(`update reports set status = 'dismissed', acted_at = now(), action_note = 'ba test cleanup' where status = 'open' and created_at >= ${q(since)} and (reporter_id in (select id from members where email like ${q(`${PREFIX}t-q${RUN}%`)}))`);
  exec(`update member_photos set status = 'approved', reviewed_at = now() where status = 'pending' and member_id in (select id from members where email like ${q(`${PREFIX}t-q${RUN}%`)})`);
}

done();
