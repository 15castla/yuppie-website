// The membership: cancel at period end with a reason (and today's one-step cancel), keep it, the billing
// portal (and /members/billing), the gate for paused and ended members (A-D4) with help still open, and
// Delete my account (brief 5.6) through to applying again with the same email.
import {
  BASE, action, adminSession, cookieFor, done, eq, fakesMark, fakesSince, fd, insertBooking, makeEvent, makeMember,
  memberSession, messages, ok, page, q, redirectedTo, sql1, stripe, svc, waitFor,
} from './lib.mjs';

const m = await makeMember('ms1');
const s = await memberSession(m.email);
const sub = (await stripe('GET', `subscriptions/${m.subscription}`)).json;
const periodEnd = sub.items.data[0].current_period_end * 1000;
const afterEnd = await makeEvent('msafter', { price: 1500, startInHours: (periodEnd - Date.now()) / 3600000 + 24 * 5 });
const beforeEnd = await makeEvent('msbefore', { price: 0, startInHours: 24 * 3 });
await insertBooking(m, afterEnd);
await insertBooking(m, beforeEnd);

// ---- Cancel membership (two-step, with the reason)
let mark = fakesMark();
const c1 = await action('you.requestCancelMembership', ['Moving away'], s);
ok(c1.result.ok, 'requestCancelMembership: ok', c1);
eq(new Date(c1.result.endsAt).getTime(), periodEnd, 'ends at the end of the billing period');
ok(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(c1.result.endsOn), `endsOn reads like "Thu 12 Nov" (${c1.result.endsOn})`);
eq(c1.result.bookingsAfterEnd.map((b) => b.title), ['Msafter night'], 'the D8 warning: the booking after the end date, not the one before');
const st = fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${m.subscription}` && l.method === 'POST');
eq([st?.body.cancel_at_period_end, /^sub-cancel-at-period-end-/.test(st?.idem ?? '')], ['true', true], 'Stripe: cancel_at_period_end, with an idempotency key');
const row = sql1(`select cancel_at, cancel_requested_at, cancel_reason, membership_status from members where id = ${q(m.id)}`);
eq([new Date(row.cancel_at).getTime(), row.cancel_reason, row.membership_status], [periodEnd, 'Moving away', 'active'], 'cancel_at and the reason saved; still active until then');
await waitFor(() => messages(`member_id = ${q(m.id)} and template = 'cancel-requested' and status = 'sent'`).length === 1, 'cancel-requested email sent');
mark = fakesMark();
const c2 = await action('you.requestCancelMembership', ['Again'], s);
eq([c2.result.ok, c2.result.endsAt], [true, c1.result.endsAt], 'asking again: the same end date');
eq(fakesSince(mark, 'stripe').filter((l) => l.path.startsWith('/v1/subscriptions/')).length, 0, 'and no second Stripe call');
eq((await redirectedTo('/members/events', s)), null, 'an ending member still uses everything');

// ---- Keep my membership
mark = fakesMark();
eq((await action('you.keepMyMembership', [], s)).result, { ok: true }, 'keepMyMembership: ok');
eq(sql1(`select cancel_at, cancel_requested_at, cancel_reason from members where id = ${q(m.id)}`), { cancel_at: null, cancel_requested_at: null, cancel_reason: null }, 'the cancel is undone');
eq(fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${m.subscription}`)?.body.cancel_at_period_end, 'false', 'Stripe: cancel_at_period_end false');
eq((await action('you.keepMyMembership', [], s)).result, { ok: true }, 'keeping an active membership: nothing to do, ok');

// ---- today's one-step cancel stores the date too
eq((await action('profile.cancelMembership', [], s)).result, { success: true }, 'profile.cancelMembership (today’s button): ok');
ok(sql1(`select cancel_at from members where id = ${q(m.id)}`).cancel_at, 'and now stores cancel_at');
await action('you.keepMyMembership', [], s);

// ---- billing portal
mark = fakesMark();
const p1 = await action('you.getBillingPortalUrl', [], s);
ok(p1.result.ok && p1.result.url.startsWith('https://billing.stripe.com/'), 'getBillingPortalUrl: a Stripe portal URL', p1);
const ps = fakesSince(mark, 'stripe').find((l) => l.path === '/v1/billing_portal/sessions');
eq([ps.body.customer, ps.body.flow_data, ps.body.return_url.endsWith('/members/you')], [m.customer, undefined, true], 'Manage: the member’s customer, back to You');
const prob = await makeMember('ms2', 'problem');
const sp = await memberSession(prob.email);
mark = fakesMark();
await action('you.getBillingPortalUrl', [], sp);
eq(fakesSince(mark, 'stripe').find((l) => l.path === '/v1/billing_portal/sessions')?.body.flow_data, { type: 'payment_method_update' }, 'payment problem: opens on update payment method');
const billing = await page('/members/billing', sp);
ok(billing.status === 303 && billing.location?.startsWith('https://billing.stripe.com/'), '/members/billing redirects to the portal (the payment-failed email’s link)', billing.status);
eq((await page('/members/billing')).status, 307, '/members/billing signed out: to the login page');

// ---- the gate (A-D4)
const paused = await makeMember('ms3', 'paused');
const spa = await memberSession(paused.email);
for (const path of ['/members/events', '/members/discounts', '/members/access', '/members/you', '/members/plans', '/members/profile/edit']) {
  eq(await redirectedTo(path, spa), '/members/membership', `paused: ${path} goes to the gate`);
}
const gate = await page('/members/membership', spa);
ok(gate.status === 200 && gate.text.includes('Your membership is paused.'), 'paused: the gate page draws (placeholder words)');
for (const path of ['/members/you/help', '/members/you/help/faq', '/members/you/help/contact', '/members/you/help/privacy']) {
  eq([(await page(path, spa)).status, await redirectedTo(path, spa)], [200, null], `paused: ${path} still opens`);
}
const ended = await makeMember('ms4', 'ended');
const se = await memberSession(ended.email);
const endedGate = await page('/members/membership', se);
ok(endedGate.status === 200 && endedGate.text.includes('Your membership') && endedGate.text.includes('has ended.') && /It ended on \d{1,2} [A-Z][a-z]{2}\./.test(endedGate.text), 'ended: the approved ended gate, with the date');
eq(await redirectedTo('/members/events', se), '/members/membership', 'ended: gated');
const lapsed = await makeMember('ms5', 'lapsed');
const sl = await memberSession(lapsed.email);
eq(await redirectedTo('/members/events', sl), '/members/membership', 'cancel date passed but no webhook yet: gated as ended');
ok((await page('/members/membership', sl)).text.includes('has ended.'), 'and shown the ended gate');
eq(await redirectedTo('/members/membership', s), '/members/events', 'an active member who opens the gate goes to Events');
eq((await action('events.getMyBooking', ['00000000-0000-0000-0000-000000000000'], spa)).redirect, '/members/membership', 'actions gate too (decided on the server)');

// ---- Delete my account (5.6) and applying again with the same email
const d = await makeMember('ms6');
const sd = await memberSession(d.email);
const { data: app } = await svc.from('applications').insert({ full_name: 'Ms6 Tester', email: d.email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', status: 'approved', stripe_customer_id: d.customer, stripe_subscription_id: d.subscription }).select('id').single();
await svc.from('invited_emails').insert({ email: d.email, application_id: app.id });
const avatarPath = `avatars/${d.id}-test.png`;
await svc.storage.from('member-media').upload(avatarPath, Buffer.from('89504e470d0a1a0a', 'hex'), { contentType: 'image/png' });
await svc.from('members').update({ avatar_url: svc.storage.from('member-media').getPublicUrl(avatarPath).data.publicUrl }).eq('id', d.id);
const fut = await makeEvent('msdel', { price: 2000 });
const bd = await insertBooking(d, fut);
eq((await action('you.deleteMyAccount', ['remove'], sd)).result, { ok: false, error: 'Type delete to confirm.' }, 'deleteMyAccount needs the word delete');
mark = fakesMark();
const del = await action('you.deleteMyAccount', ['Delete'], sd);
eq(del.redirect, '/', 'deleteMyAccount: done, to the public home page');
eq(fakesSince(mark, 'stripe').find((l) => l.method === 'DELETE' && l.path === `/v1/subscriptions/${d.subscription}`)?.idem, `sub-cancel-now-${d.subscription}`, 'the Stripe subscription is cancelled now');
eq(sql1(`select status, cancel_reason, refund_status from bookings where id = ${q(bd.id)}`), { status: 'cancelled', cancel_reason: 'account_deleted', refund_status: 'succeeded' }, 'future bookings cancelled and refunded (account_deleted); the row survives');
const gone = await fetch(`${SUPA()}/storage/v1/object/public/member-media/${avatarPath}`);
eq(gone.status, 404, 'the photo file is removed');
const logged = messages(`member_id = ${q(d.id)} and template = 'account-deleted'`);
eq([logged.length, logged[0]?.status, logged[0]?.to_address], [1, 'sent', d.email], 'account-deleted sent to the address they had');
const anon = sql1(`select email, full_name, phone, employer, role_title, bio, avatar_url, membership_status, ended_reason, deleted_at is not null as deleted from members where id = ${q(d.id)}`);
eq(anon, { email: `deleted+${d.id}@invalid.clubyuppie.com`, full_name: null, phone: null, employer: null, role_title: null, bio: null, avatar_url: null, membership_status: 'cancelled', ended_reason: 'account_deleted', deleted: true }, 'the members row is anonymised and kept');
eq(sql1(`select email from applications where id = ${q(app.id)}`).email, `deleted+${app.id}@invalid.clubyuppie.com`, 'the old application no longer holds the email');
const { data: authUser } = await svc.auth.admin.getUserById(d.id);
ok(authUser.user.email === `deleted+${d.id}@invalid.clubyuppie.com` && authUser.user.banned_until && new Date(authUser.user.banned_until).getTime() > Date.now() + 365 * 86400000, 'the auth user is banned and its email moved (members.id cascades, so it is not deleted)', authUser.user);
const loginAgain = await fetch(`${SUPA()}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: sd.refresh_token }) });
ok(loginAgain.status >= 400, `the old session cannot be refreshed (HTTP ${loginAgain.status})`);
const oldToken = await redirectedTo('/members/events', sd);
ok(oldToken === '/member-login' || oldToken === '/members/membership', `and the old access token gets nothing (${oldToken})`);
// Apply again with the same email, and be approved again.
const reapply = await action('apply.submitApplication', [fd({ full_name: 'Ms6 Again', email: d.email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_payment_method_id: `pm_reapply_${Date.now()}` })]);
eq(reapply.result, { success: true }, 'applying again with the same email works');
const newApp = sql1(`select id, status from applications where email = ${q(d.email)}`);
eq(newApp.status, 'pending', 'a new pending application');
const admin = await adminSession();
await action('admin.applications.approveApplication', [fd({ id: newApp.id })], admin);
const newMember = sql1(`select id, membership_status from members where email = ${q(d.email)}`);
ok(newMember && newMember.id !== d.id && newMember.membership_status === 'active', 'and approving it makes a new member (a new account, not the deleted one)', newMember);
void BASE; void cookieFor;
done();

function SUPA() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}
