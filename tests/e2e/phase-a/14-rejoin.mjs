// Applying again (Albert, 8 Nov 2026): "If they end they would need to reapply", and the two messages. On the
// stage 1 server (tests/e2e/phase-a/server.sh), with migration 20261108090000_rejoin applied.
//
// - Someone waiting is told "We'll be in touch soon", a current member "You're already a member." (with Sign in),
//   both before any Stripe customer is made; a member who changed their email is a member under either address.
// - A member whose membership ended applies again: their old approved application is superseded, the new one waits,
//   and approving it starts the membership again on the same account (history kept, the new subscription), never a
//   second account. Ended again later, they are told again (membership-ended once per ending); and can rejoin again.
// - An ended member whose account has a newer email is asked to apply with it (no second account).
// - Approval stops before any charge when the email or its login is a current member's, when the old subscription
//   still bills in Stripe, or when the login is another email than the ended member's (no second account).
//
//   PHASE_A_BASE=http://localhost:3141 node tests/e2e/phase-a/14-rejoin.mjs
import {
  action, adminSession, done, emit, eq, fakesMark, fakesSince, fd, insertBooking, makeEvent, makeMember, memberSession,
  messages, ok, page, q, rand, redirectedTo, sql, sql1, stripe, svc, waitFor,
} from './lib.mjs';

const WAITING = 'You’ve already got an application with us. We’ll be in touch soon.';
const MEMBER = 'You’re already a member.';
const MOVED = 'Your membership is under a newer email. Apply with that one instead.';
const form = (email, name = 'Rejoin Tester') => fd({ full_name: name, email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_payment_method_id: `pm_rejoin_${rand()}` });
const approvedApp = async (email, customer, name = 'Old Application') => {
  const { data, error } = await svc.from('applications').insert({ full_name: name, email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', status: 'approved', stripe_customer_id: customer, stripe_subscription_id: `sub_old_${rand()}` }).select('id').single();
  if (error) throw error;
  return data.id;
};
const customersMade = (mark) => fakesSince(mark, 'stripe').filter((l) => l.method === 'POST' && l.path === '/v1/customers').length;
const subsMade = (mark) => fakesSince(mark, 'stripe').filter((l) => l.method === 'POST' && l.path === '/v1/subscriptions').length;
const admin = await adminSession();

// ---- someone waiting
const waitingEmail = `f.t-rjwait-${rand()}@example.com`;
await svc.from('applications').insert({ full_name: 'Waiting Tester', email: waitingEmail, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x' });
eq((await action('apply.checkApplicant', [waitingEmail.toUpperCase()])).result, { ok: false, error: WAITING, isDuplicate: true }, 'waiting: the early check says so (any case)');
let mark = fakesMark();
eq((await action('apply.submitApplication', [form(waitingEmail)])).result, { success: false, error: WAITING, isDuplicate: true }, 'waiting: the submit says so');
eq(customersMade(mark), 0, 'waiting: no Stripe customer made');

// ---- a current member
const m = await makeMember('rjact');
await approvedApp(m.email, m.customer);
eq((await action('apply.checkApplicant', [m.email])).result, { ok: false, error: MEMBER, isDuplicate: true, signIn: true }, 'member: the early check says so, with Sign in');
mark = fakesMark();
eq((await action('apply.submitApplication', [form(m.email)])).result, { success: false, error: MEMBER, isDuplicate: true, signIn: true }, 'member: the submit says so');
eq(customersMade(mark), 0, 'member: no Stripe customer made');
for (const state of ['ending', 'problem', 'paused']) {
  const other = await makeMember(`rj${state}`, state);
  eq((await action('apply.checkApplicant', [other.email])).result.ok, false, `member: ${state} is still a member`);
}
// A cancel date that passed but whose end is not recorded yet (the memberships job asks Stripe first): still a
// member, so a second subscription never starts beside one that may still be live.
const lapsed = await makeMember('rjlapse', 'lapsed');
eq((await action('apply.checkApplicant', [lapsed.email])).result.error, MEMBER, 'member: a cancel date passed but not yet recorded still counts');
// Exact emails: * is a wildcard to PostgREST's ilike, so a lookalike address must not match someone else.
const star = m.email.replace('rjact', 'rj*t');
ok(star !== m.email, 'lookalike made', star);
eq((await action('apply.checkApplicant', [star])).result, { ok: true }, 'exact: an address with * does not match another member');

// ---- a member who changed their email (Kira, 8 Nov): a member under the old address and the new
const k = await makeMember('rjkira');
const oldEmail = `f.t-rjkira-old-${rand()}@example.com`;
await approvedApp(oldEmail, k.customer);
eq((await action('apply.submitApplication', [form(oldEmail)])).result.error, MEMBER, 'changed email: the old address is a member');
eq((await action('apply.submitApplication', [form(k.email)])).result.error, MEMBER, 'changed email: and the new one');

// ---- an ended member applies again
const e = await makeMember('rjend', 'ended');
await stripe('DELETE', `subscriptions/${e.subscription}`); // ended: the old subscription is over in Stripe
const oldApp = await approvedApp(e.email, e.customer);
const ev = await makeEvent('rjpast', { price: 0, startInHours: 2 });
const pastBooking = await insertBooking(e, ev);
eq((await action('apply.checkApplicant', [e.email])).result, { ok: true }, 'ended: may apply');
mark = fakesMark();
eq((await action('apply.submitApplication', [form(e.email, 'Rejoin Again')])).result, { success: true }, 'ended: the application goes in');
eq(customersMade(mark), 1, 'ended: a Stripe customer for the new card');
ok(sql1(`select superseded_at from applications where id = ${q(oldApp)}`).superseded_at, 'ended: the old approved application is superseded (kept)');
eq(sql1(`select status from applications where id = ${q(oldApp)}`).status, 'approved', 'ended: and still says approved');
const newApp = sql1(`select id, status, stripe_customer_id from applications where lower(email) = lower(${q(e.email)}) and superseded_at is null`);
eq(newApp.status, 'pending', 'ended: the new application waits');
ok((await page(`/admin/applications/${newApp.id}`, admin)).text.includes('Rejoining: a member until'), 'admin: the waiting card says Rejoining');
eq((await action('apply.checkApplicant', [e.email])).result.error, WAITING, 'ended, applied: now waiting');

mark = fakesMark();
await action('admin.applications.approveApplication', [fd({ id: newApp.id })], admin);
const back = sql1(`select id, membership_status, ended_at, ended_reason, stripe_customer_id, stripe_subscription_id, full_name from members where id = ${q(e.id)}`);
eq([back.membership_status, back.ended_at, back.ended_reason], ['active', null, null], 'approved: the same member is active again, the ending cleared');
eq(back.stripe_customer_id, newApp.stripe_customer_id, 'approved: the new card’s customer');
ok(back.stripe_subscription_id && back.stripe_subscription_id !== e.subscription, 'approved: a new subscription', back.stripe_subscription_id);
eq(subsMade(mark), 1, 'approved: one subscription made');
eq(back.full_name, 'Rejoin Again', 'approved: the details from the new application');
eq(sql1(`select status, payment_error from applications where id = ${q(newApp.id)}`), { status: 'approved', payment_error: null }, 'approved: the application is approved');
eq(sql(`select id from members where lower(email) = lower(${q(e.email)})`).length, 1, 'approved: still one account for the email');
eq(sql1(`select status from bookings where id = ${q(pastBooking.id)}`).status, 'confirmed', 'approved: their history is kept (an earlier booking)');
const se = await memberSession(e.email);
eq(await redirectedTo('/members/events', se), null, 'approved: they are in (no membership gate)');

// ---- ended again later: told again; and can rejoin again
const firstSub = back.stripe_subscription_id;
const deleted = (await stripe('DELETE', `subscriptions/${firstSub}`)).json;
eq((await emit('customer.subscription.deleted', deleted)).webhook, 200, 'ended again: the webhook');
eq(sql1(`select membership_status from members where id = ${q(e.id)}`).membership_status, 'cancelled', 'ended again: cancelled');
await waitFor(() => messages(`member_id = ${q(e.id)} and template = 'membership-ended' and status = 'sent'`).length === 1, 'ended again: membership-ended sent');
eq((await action('apply.submitApplication', [form(e.email, 'Rejoin Twice')])).result, { success: true }, 'rejoin twice: the application goes in');
const third = sql1(`select id from applications where lower(email) = lower(${q(e.email)}) and superseded_at is null`);
await action('admin.applications.approveApplication', [fd({ id: third.id })], admin);
const again = sql1(`select membership_status, stripe_subscription_id from members where id = ${q(e.id)}`);
eq(again.membership_status, 'active', 'rejoin twice: active again');
const ended2 = (await stripe('DELETE', `subscriptions/${again.stripe_subscription_id}`)).json;
await emit('customer.subscription.deleted', ended2);
await waitFor(() => messages(`member_id = ${q(e.id)} and template = 'membership-ended' and status = 'sent'`).length === 2, 'ended a second time: told again (once per ending)');
eq(sql(`select id from applications where lower(email) = lower(${q(e.email)}) and superseded_at is not null`).length, 2, 'two superseded applications, one per rejoin');

// ---- an ended member whose application used another address: applies with their account email
const e2 = await makeMember('rjend2', 'ended');
await stripe('DELETE', `subscriptions/${e2.subscription}`); // ended: the old subscription is over in Stripe
const e2old = `f.t-rjend2-old-${rand()}@example.com`;
await approvedApp(e2old, e2.customer);
eq((await action('apply.submitApplication', [form(e2.email)])).result, { success: true }, 'ended, other address: applies with the account email');
const e2app = sql1(`select id from applications where lower(email) = lower(${q(e2.email)})`);
await action('admin.applications.approveApplication', [fd({ id: e2app.id })], admin);
eq(sql1(`select membership_status from members where id = ${q(e2.id)}`).membership_status, 'active', 'ended, other address: the same account starts again');
eq(sql(`select id from members where lower(email) = lower(${q(e2.email)})`).length, 1, 'ended, other address: no second account');

// ---- an ended member whose account has a newer email, applying with the old one: asked to use the newer one (so
// approval finds their account, never a second one); with it, the same account starts again
const mv = await makeMember('rjmove', 'ended');
await stripe('DELETE', `subscriptions/${mv.subscription}`); // ended: the old subscription is over in Stripe
const mvOld = `f.t-rjmove-old-${rand()}@example.com`;
const mvApp = await approvedApp(mvOld, mv.customer);
eq((await action('apply.checkApplicant', [mvOld])).result, { ok: false, error: MOVED, isDuplicate: true }, 'moved: the early check asks for the newer email');
mark = fakesMark();
eq((await action('apply.submitApplication', [form(mvOld)])).result, { success: false, error: MOVED, isDuplicate: true }, 'moved: the submit says so');
eq(customersMade(mark), 0, 'moved: no Stripe customer made');
eq(sql1(`select superseded_at from applications where id = ${q(mvApp)}`).superseded_at, null, 'moved: the old application is left as it is');
eq((await action('apply.submitApplication', [form(mv.email)])).result, { success: true }, 'moved: applies with the account email');
const mvNew = sql1(`select id from applications where lower(email) = lower(${q(mv.email)}) and superseded_at is null`);
await action('admin.applications.approveApplication', [fd({ id: mvNew.id })], admin);
eq(sql1(`select membership_status from members where id = ${q(mv.id)}`).membership_status, 'active', 'moved: the same account starts again');

// ---- ended here but still billing in Stripe (an admin ended it without Stripe): stopped before any charge
const sb = await makeMember('rjstill', 'ended');
eq((await action('apply.submitApplication', [form(sb.email)])).result, { success: true }, 'still billing: the application goes in');
const sbApp = sql1(`select id from applications where lower(email) = lower(${q(sb.email)}) and superseded_at is null`);
mark = fakesMark();
await action('admin.applications.approveApplication', [fd({ id: sbApp.id })], admin);
eq(subsMade(mark), 0, 'still billing: nothing charged');
ok(/still billing in Stripe/.test(sql1(`select payment_error from applications where id = ${q(sbApp.id)}`).payment_error ?? ''), 'still billing: the admin is told to cancel it in Stripe');
eq(sql1(`select membership_status, stripe_subscription_id from members where id = ${q(sb.id)}`), { membership_status: 'cancelled', stripe_subscription_id: sb.subscription }, 'still billing: the member is left as they were');
await stripe('DELETE', `subscriptions/${sb.subscription}`);
await action('admin.applications.approveApplication', [fd({ id: sbApp.id })], admin);
eq(sql1(`select membership_status from members where id = ${q(sb.id)}`).membership_status, 'active', 'still billing: once cancelled in Stripe, approving works');

// ---- ended, but the login uses another email than the member row (an email change that half failed): applying
// with the member row's email is stopped before any charge, not made a second account
const mm = await makeMember('rjmism', 'ended');
await stripe('DELETE', `subscriptions/${mm.subscription}`);
const { error: mmError } = await svc.auth.admin.updateUserById(mm.id, { email: `f.t-rjmism-login-${rand()}@example.com`, email_confirm: true });
if (mmError) throw mmError;
eq((await action('apply.submitApplication', [form(mm.email)])).result, { success: true }, 'login differs: the application goes in');
const mmApp = sql1(`select id from applications where lower(email) = lower(${q(mm.email)}) and superseded_at is null`);
mark = fakesMark();
await action('admin.applications.approveApplication', [fd({ id: mmApp.id })], admin);
eq(subsMade(mark), 0, 'login differs: nothing charged');
ok(/sign in with a different email/.test(sql1(`select payment_error from applications where id = ${q(mmApp.id)}`).payment_error ?? ''), 'login differs: the admin is told why');
eq(sql(`select id from members where lower(email) = lower(${q(mm.email)})`).length, 1, 'login differs: no second account');

// ---- approving an application for a current member stops before any charge
const cur = await makeMember('rjcur');
const { data: sneaky } = await svc.from('applications').insert({ full_name: 'Second Try', email: cur.email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_customer_id: cur.customer, stripe_payment_method_id: 'pm_x' }).select('id').single();
mark = fakesMark();
await action('admin.applications.approveApplication', [fd({ id: sneaky.id })], admin);
eq(subsMade(mark), 0, 'current member: nothing charged');
ok(/current member/.test(sql1(`select payment_error from applications where id = ${q(sneaky.id)}`).payment_error ?? ''), 'current member: the admin is told why');
eq(sql1(`select status from applications where id = ${q(sneaky.id)}`).status, 'pending', 'current member: the application still waits (to decline)');
eq(sql1(`select stripe_subscription_id from members where id = ${q(cur.id)}`).stripe_subscription_id, cur.subscription, 'current member: their membership unchanged');

// The login is what approval goes by: a current member whose login email changed but whose member row still has
// the old one (the copy failed) is stopped too, before any charge.
const lg = await makeMember('rjlogin');
const lgNew = `f.t-rjlogin-new-${rand()}@example.com`;
const { error: moveError } = await svc.auth.admin.updateUserById(lg.id, { email: lgNew, email_confirm: true });
if (moveError) throw moveError;
const { data: lgApp } = await svc.from('applications').insert({ full_name: 'Login Moved', email: lgNew, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_customer_id: lg.customer, stripe_payment_method_id: 'pm_x' }).select('id').single();
mark = fakesMark();
await action('admin.applications.approveApplication', [fd({ id: lgApp.id })], admin);
eq(subsMade(mark), 0, 'login moved: nothing charged');
ok(/current member/.test(sql1(`select payment_error from applications where id = ${q(lgApp.id)}`).payment_error ?? ''), 'login moved: the admin is told why');
eq(sql1(`select stripe_subscription_id from members where id = ${q(lg.id)}`).stripe_subscription_id, lg.subscription, 'login moved: their membership unchanged');

done();
