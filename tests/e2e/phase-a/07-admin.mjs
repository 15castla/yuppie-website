// Admin (brief 2.6) server side: the real /admin/login to aal2 (password, then TOTP), who may call admin
// actions, apply and approve (emails, welcome text, audit), Decline with and without the email and the
// card release (B-D3, C-D8), Pause, Resume and Cancel now with and without Stripe (B-D2, B-D23, A-D8),
// event address, moving a booked event (changed_at, C-D11, optional email), Cancel event (B-D8, safe to
// repeat), Attendees and the CSV (B-D7), and an admin_audit row for each action.
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import {
  ALERTS, BASE, action, adminSession, cookieFor, done, emit, eq, exec, fakeState, fakesMark, fakesSince, fd, insertBooking,
  makeBooking, makeEvent, makeMember, memberSession, messages, ok, q, redirectedTo, sql, sql1, stripe, svc, waitFor,
} from './lib.mjs';

const since = new Date().toISOString();
const audits = (action_, target) => sql(`select action, admin_id, details from admin_audit where action = ${q(action_)} and target_id = ${q(target)} and created_at >= ${q(since)}`);

// ---- the real admin login page, to aal2
const browser = await chromium.launch();
try {
  const pageB = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const login = await loginAdmin(pageB, BASE, adminCreds('f.'));
  eq(login.aal, 'aal2', '/admin/login: password then the TOTP code reaches aal2');
  ok(new URL(pageB.url()).pathname === '/admin' && (await pageB.locator('h1').first().innerText()).trim().length > 0, 'and the dashboard opens');
} finally {
  await browser.close();
}
const admin = await adminSession('f.');

// ---- who may call admin actions
const plain = await makeMember('ad0');
const sPlain = await memberSession(plain.email);
eq((await action('admin.memberStatus.adminPauseMember', [plain.id, { stripe: true }], sPlain)).redirect, '/', 'a member calling an admin action is turned away');
const aal1 = await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'local-admin-password-1' }) })).json();
eq((await action('admin.memberStatus.adminPauseMember', [plain.id, { stripe: true }], aal1)).redirect, '/admin/login', 'an admin with the password only (aal1) is sent to log in');
eq(sql1(`select membership_status from members where id = ${q(plain.id)}`).membership_status, 'active', 'and nothing changed');

// ---- apply, then approve
const appEmail = `f.t-apply-${Date.now()}@example.com`;
const pm = `pm_apply_${Date.now()}`;
let mark = fakesMark();
const applied = await action('apply.submitApplication', [fd({ full_name: 'Hannah Reed', email: appEmail, phone: '07700 900123', employer: 'Calder Partners', role_title: 'Associate', linkedin_url: 'https://linkedin.com/in/hr', instagram_username: 'hr', stripe_payment_method_id: pm })]);
eq(applied.result, { success: true }, 'submitApplication: ok');
const app = sql1(`select id, status, stripe_customer_id from applications where email = ${q(appEmail)}`);
eq(fakesSince(mark, 'stripe').find((l) => l.path === '/v1/customers')?.idem, `apply-customer-${pm}`, 'the Stripe customer is made with an idempotency key');
await waitFor(() => messages(`application_id = ${q(app.id)} and template = 'application-received' and status = 'sent' and to_address = ${q(appEmail)}`).length === 1, 'application-received to the applicant (C-D3)');
await waitFor(() => messages(`application_id = ${q(app.id)} and template = 'admin-new-application' and status = 'sent' and to_address = ${q(ALERTS)}`).length === 1, 'admin-new-application to ADMIN_ALERTS_EMAIL (C-D7)');
mark = fakesMark();
await action('admin.applications.approveApplication', [fd({ id: app.id })], admin);
const approved = sql1(`select a.status, m.id as member_id, m.membership_status from applications a left join members m on lower(m.email) = lower(a.email) where a.id = ${q(app.id)}`);
eq([approved.status, approved.membership_status], ['approved', 'active'], 'approve: application approved, member active');
ok(/^approve-sub-/.test(fakesSince(mark, 'stripe').find((l) => l.path === '/v1/subscriptions' && l.method === 'POST')?.idem ?? ''), 'the subscription is made with an idempotency key');
await waitFor(() => messages(`application_id = ${q(app.id)} and template = 'approval' and status = 'sent'`).length === 1, 'the rewritten approval email');
await waitFor(() => messages(`application_id = ${q(app.id)} and template = 'welcome' and channel = 'sms' and status = 'sent'`).length === 1, 'the short welcome text');
const sms = fakesSince(mark, 'sms').find((x) => x.to === '+447700900123');
ok(/^Club Yuppie: You’re in\. Log in: .*\/member-login$/.test(sms?.body ?? ''), `the text reads "Club Yuppie: You’re in. Log in: …/member-login" (${sms?.body})`);
eq(audits('application.approve', app.id).length, 1, 'audit: application.approve');
await action('admin.applications.approveApplication', [fd({ id: app.id })], admin);
eq(messages(`application_id = ${q(app.id)} and template = 'approval'`).length, 1, 'approving twice sends nothing twice');

// ---- Decline: email switch on, card released
const mkApp = async (name, pmId) => {
  const email = `f.t-${name}-${Date.now()}@example.com`;
  const c = await stripe('POST', 'customers', { email });
  const { data } = await svc.from('applications').insert({ full_name: `${name} Person`, email, phone: '+447700900321', employer: 'E', role_title: 'R', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_customer_id: c.json.id, stripe_payment_method_id: pmId }).select('id').single();
  return { id: data.id, email };
};
const d1 = await mkApp('decline1', `pm_d1_${Date.now()}`);
mark = fakesMark();
const dec1 = await action('admin.applications.declineApplication', [d1.id, { sendEmail: true }], admin);
eq(dec1.result, { ok: true, cardReleased: true, emailed: true }, 'Decline with the email: card released, emailed');
const detach = fakesSince(mark, 'stripe').find((l) => l.path.endsWith('/detach'));
eq([detach?.path, detach?.idem], [`/v1/payment_methods/pm_d1_${d1.id ? detach.path.split('pm_d1_')[1].split('/')[0] : ''}/detach`, `detach-${detach?.path.split('/')[3]}`], 'the saved card is detached in Stripe (C-D8), with an idempotency key');
const d1row = sql1(`select status, card_released_at is not null as released from applications where id = ${q(d1.id)}`);
eq(d1row, { status: 'rejected', released: true }, 'status rejected (B-D9), card_released_at set');
const st = await fakeState();
const declineMail = st.emails.find((e) => [].concat(e.to).includes(d1.email));
ok(declineMail?.text?.includes('we’ve removed the card you saved'), 'the decline email says the card was removed');
eq([declineMail?.from, declineMail?.reply_to], ['Club Yuppie <noreply@clubyuppie.com>', 'hello@clubyuppie.com'], 'from Club Yuppie, reply-to hello@clubyuppie.com (C-D6)');
eq(sms && st.sms.filter((x) => x.to === '+447700900321').length, 0, 'never a text for a decline (C-D2)');
eq(audits('application.decline', d1.id)[0]?.details.send_email, true, 'audit: application.decline');
const d2 = await mkApp('decline2', `pm_d2_${Date.now()}`);
eq((await action('admin.applications.declineApplication', [d2.id, { sendEmail: false }], admin)).result, { ok: true, cardReleased: true, emailed: false }, 'Decline with the switch off: card released, no email');
eq(messages(`application_id = ${q(d2.id)}`).length, 0, 'nothing in message_log for it');
const d3 = await mkApp('decline3', `pm_fail_${Date.now()}`);
eq((await action('admin.applications.declineApplication', [d3.id, { sendEmail: true }], admin)).result, { ok: true, cardReleased: false, emailed: true }, 'a card Stripe will not release: declined, emailed without the card line');
ok(!((await fakeState()).emails.find((e) => [].concat(e.to).includes(d3.email))?.text ?? '').includes('removed the card'), 'and the email does not claim the card was removed');
const d4 = await mkApp('decline4', `pm_d4_${Date.now()}`);
await action('admin.applications.rejectApplication', [fd({ id: d4.id, send_email: 'off' })], admin);
eq([sql1(`select status from applications where id = ${q(d4.id)}`).status, messages(`application_id = ${q(d4.id)}`).length], ['rejected', 0], 'today’s Reject form: Decline, and send_email=off skips the email');
eq((await action('admin.applications.declineApplication', [app.id, { sendEmail: true }], admin)).result.ok, false, 'an approved application cannot be declined');

// ---- Pause, Resume, Cancel now
const p = await makeMember('ad1');
const sp = await memberSession(p.email);
mark = fakesMark();
eq((await action('admin.memberStatus.adminPauseMember', [p.id, { stripe: true }], admin)).result, { ok: true, stripe: true }, 'Pause with Stripe ticked: ok');
const pauseCall = fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${p.subscription}`);
eq([pauseCall?.body.pause_collection, /^sub-pause-/.test(pauseCall?.idem ?? '')], [{ behavior: 'void' }, true], 'Stripe: pause_collection void, with an idempotency key');
eq(sql1(`select membership_status from members where id = ${q(p.id)}`).membership_status, 'paused', 'the member is paused');
eq(await redirectedTo('/members/events', sp), '/members/membership', 'and gated');
eq(audits('member.pause', p.id).length, 1, 'audit: member.pause');
mark = fakesMark();
eq((await action('admin.memberStatus.adminResumeMember', [p.id, { stripe: true }], admin)).result, { ok: true, stripe: true }, 'Resume with Stripe: ok');
eq(fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${p.subscription}`)?.body.pause_collection, '', 'Stripe: pause_collection cleared');
eq(await redirectedTo('/members/events', sp), null, 'active again: the members area opens');
eq(audits('member.resume', p.id).length, 1, 'audit: member.resume');
eq((await action('admin.memberStatus.adminResumeMember', [p.id, { stripe: true }], admin)).result.ok, false, 'resuming an active member: refused');
mark = fakesMark();
await action('admin.memberStatus.adminPauseMember', [p.id, { stripe: false }], admin);
eq([sql1(`select membership_status from members where id = ${q(p.id)}`).membership_status, fakesSince(mark, 'stripe').length], ['paused', 0], 'Pause with the box unticked: paused here, Stripe untouched');
await action('admin.memberStatus.adminResumeMember', [p.id, { stripe: false }], admin);

const c = await makeMember('ad2');
const cFuture = await makeEvent('adcfuture', { price: 1700 });
const cb = await makeBooking(c, cFuture);
mark = fakesMark();
eq((await action('admin.memberStatus.adminCancelMemberNow', [c.id, { stripe: true }], admin)).result, { ok: true, stripe: true, cancelledBookings: 1 }, 'Cancel now with Stripe: ok, one future booking cancelled');
eq(fakesSince(mark, 'stripe').find((l) => l.method === 'DELETE')?.idem, `sub-cancel-now-${c.subscription}`, 'Stripe: subscription cancelled now (B-D23)');
eq(sql1(`select membership_status, ended_reason from members where id = ${q(c.id)}`), { membership_status: 'cancelled', ended_reason: 'admin_cancelled' }, 'ended at once, admin_cancelled');
eq(sql1(`select refund_status from bookings where id = ${q(cb.id)}`).refund_status, 'succeeded', 'D8: refunded');
await waitFor(() => messages(`member_id = ${q(c.id)} and template = 'membership-ended' and status = 'sent'`).length === 1, 'membership-ended sent');
await emit('customer.subscription.deleted', (await stripe('GET', `subscriptions/${c.subscription}`)).json);
eq(messages(`member_id = ${q(c.id)} and template = 'membership-ended'`).length, 1, 'Stripe’s own deleted webhook afterwards: no second email');
eq(audits('member.cancel_now', c.id).length, 1, 'audit: member.cancel_now');
const c2 = await makeMember('ad3');
mark = fakesMark();
await action('admin.memberStatus.adminCancelMemberNow', [c2.id, { stripe: false }], admin);
eq([sql1(`select membership_status from members where id = ${q(c2.id)}`).membership_status, fakesSince(mark, 'stripe').filter((l) => l.method === 'DELETE').length], ['cancelled', 0], 'Cancel now unticked: ended here, Stripe untouched');

// ---- events: address on create, moving a booked event
const startLocal = (daysAhead, hh, mm) => {
  const d = new Date(Date.now() + daysAhead * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const title = `Admin test ${Date.now()}`;
const created = await action('admin.events.createEvent', [fd({ title, category: 'sport', location: 'Northgate Courts', address: 'Northgate Courts, 1 Sample Road, Anytown AB1 2CD', start_time: startLocal(10, 18, 30), price_pounds: '25', capacity: '16' })], admin);
eq(created.result.success, true, 'createEvent with an address: ok');
const ev = sql1(`select e.id, e.slug, a.address from events e left join event_addresses a on a.event_id = e.id where e.title = ${q(title)}`);
eq(ev.address, 'Northgate Courts, 1 Sample Road, Anytown AB1 2CD', 'the address is saved in event_addresses');
eq((await action('admin.eventBookings.adminGetEventAddress', [ev.id], admin)).result, ev.address, 'adminGetEventAddress reads it back');
eq(audits('event.create', ev.id).length, 1, 'audit: event.create');
const evRow = { id: ev.id, price: 2500 };
const booked1 = await makeMember('ad4');
const booked2 = await makeMember('ad5');
await makeBooking(booked1, evRow);
await makeBooking(booked2, { ...evRow, price: 0 }, { paid: false });
const editBase = { event_id: ev.id, title, category: 'sport', location: 'Northgate Courts', address: 'Northgate Courts, 1 Sample Road, Anytown AB1 2CD', start_time: startLocal(10, 18, 30), price_pounds: '25', capacity: '16' };
const noMove = await action('admin.events.updateEventDetails', [fd({ ...editBase, description: 'New words only' })], admin);
eq([noMove.result.success, noMove.result.moved], [true, null], 'an edit that moves nothing: no change recorded');
eq(sql1(`select changed_at from events where id = ${q(ev.id)}`).changed_at, null, 'changed_at stays empty');
const moved = await action('admin.events.updateEventDetails', [fd({ ...editBase, start_time: startLocal(10, 19, 30), notify_booked: 'on' })], admin);
eq([moved.result.moved, moved.result.bookedCount, moved.result.emailing], ['time', 2, true], 'moving the time of a booked event: moved, 2 booked, emailing');
ok(sql1(`select changed_at is not null as c from events where id = ${q(ev.id)}`).c, 'changed_at set (they may now cancel for a full refund, C-D11)');
await waitFor(() => messages(`event_id = ${q(ev.id)} and template = 'event-changed' and status = 'sent'`).length === 2, 'event-changed to both booked members');
eq(audits('event.update', ev.id).filter((a) => a.details.moved === 'time').length, 1, 'audit: event.update with what moved');
eq((await action('admin.eventBookings.adminEmailEventChange', [ev.id], admin)).result, { ok: true, emailed: 0, failed: 0 }, 'pressing "email them" again for the same change: nobody emailed twice');
const placeMove = await action('admin.events.updateEventDetails', [fd({ ...editBase, start_time: startLocal(10, 19, 30), location: 'Riverside Club', address: 'Riverside Club, 9 Sample Walk, Anytown AB1 2CD' })], admin);
eq([placeMove.result.moved, placeMove.result.emailing], ['place', false], 'moving the place without the email: recorded, no email yet');
eq(messages(`event_id = ${q(ev.id)} and template = 'event-changed'`).length, 2, 'no email went');
eq((await action('admin.eventBookings.adminEmailEventChange', [ev.id], admin)).result, { ok: true, emailed: 2, failed: 0 }, 'then "email them": both emailed about the new place');

// ---- Cancel event (B-D8)
mark = fakesMark();
const cancel = await action('admin.eventBookings.adminCancelEvent', [ev.id, { note: 'the courts are closed that evening' }], admin);
eq(cancel.result, { ok: true, cancelled: 2, refunded: 1, refundFailed: 0 }, 'Cancel event: 2 bookings cancelled, the paid one refunded');
eq(sql1(`select cancelled_at is not null as c, cancel_note from events where id = ${q(ev.id)}`), { c: true, cancel_note: 'the courts are closed that evening' }, 'the event is cancelled with the reason');
eq(sql(`select cancel_reason, cancelled_by from bookings where event_id = ${q(ev.id)}`).map((b) => `${b.cancel_reason}/${b.cancelled_by}`).sort(), ['event_cancelled/club', 'event_cancelled/club'], 'bookings cancelled by the club');
eq(fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds').length, 1, 'one refund');
await waitFor(() => messages(`event_id = ${q(ev.id)} and template = 'event-cancelled' and status = 'sent'`).length === 2, 'event-cancelled to both members');
mark = fakesMark();
eq((await action('admin.eventBookings.adminCancelEvent', [ev.id, { note: null }], admin)).result, { ok: true, cancelled: 0, refunded: 0, refundFailed: 0 }, 'Cancel event again: nothing more to do');
eq([fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds').length, messages(`event_id = ${q(ev.id)} and template = 'event-cancelled'`).length], [0, 2], 'no second refund, no second email');
eq(audits('event.cancel', ev.id).length, 2, 'audit: event.cancel (each press)');
eq((await action('events.rsvpToEvent', [fd({ event_id: ev.id })], sPlain)).result.success, false, 'nobody can book a cancelled event');

// ---- Attendees and the CSV
const att = await makeEvent('adatt', { price: 1000 });
const weird = await makeMember('ad6', 'active', { full_name: '=HYPERLINK("http://x","y")' });
const normal = await makeMember('ad7');
await makeBooking(weird, att);
const nb = await makeBooking(normal, att);
await action('events.cancelBooking', [nb.id], await memberSession(normal.email));
const list = (await action('admin.eventBookings.adminGetAttendees', [att.id], admin)).result;
eq([list.confirmedCount, list.cancelledCount, list.attendees.map((a) => a.status)], [1, 1, ['confirmed', 'cancelled']], 'Attendees: the count, confirmed first, cancelled people listed');
eq(list.attendees[1].refundStatus, 'succeeded', 'with their refund');
const csv = await fetch(`${BASE}/api/admin/events/${att.id}/attendees`, { headers: { cookie: cookieFor(admin) } });
const csvText = await csv.text();
eq([csv.status, csv.headers.get('content-type')], [200, 'text/csv; charset=utf-8'], 'Export list: 200 text/csv');
ok(/attachment; filename="f-t-adatt-[0-9a-f]+-attendees\.csv"/.test(csv.headers.get('content-disposition') ?? ''), 'downloaded as <slug>-attendees.csv');
const lines = csvText.replace(/^﻿/, '').trim().split('\r\n');
eq(lines[0], 'Name,Email,Phone,Status,Booked,Paid,Cancelled,Why,Refund,Refunded', 'the header row');
eq(lines.length, 3, 'one row per person');
ok(lines[1].startsWith(`"'=HYPERLINK(""http://x"",""y"")"`), 'a name a spreadsheet would run as a formula is written as text', lines[1]);
ok(lines[2].includes('Cancelled') && lines[2].includes('Member cancelled') && lines[2].includes('Refunded') && lines[2].includes('£10'), 'the cancelled row says why and the refund', lines[2]);
eq((await fetch(`${BASE}/api/admin/events/${att.id}/attendees`, { headers: { cookie: cookieFor(sPlain) }, redirect: 'manual' })).status, 307, 'a member cannot download it');
eq((await action('admin.eventBookings.adminExportAttendees', [att.id], admin)).result.csv.replace(/^\uFEFF/, ''), csvText.replace(/^\uFEFF/, ''), 'adminExportAttendees gives the same file');
ok(new Uint8Array(await (await fetch(`${BASE}/api/admin/events/${att.id}/attendees`, { headers: { cookie: cookieFor(admin) } })).arrayBuffer()).slice(0, 3).join(',') === '239,187,191', 'the file starts with a UTF-8 byte order mark (Excel shows £ right)');
ok(/,(07700 900123|'\+44 7700 900123),/.test(lines[1]), 'phone numbers as You writes them, never a bare + a spreadsheet would run', lines[1]);
ok(audits('event.export_attendees', att.id).length >= 2, 'audit: event.export_attendees');

// ---- deleteMember is audited too
const dm = await makeMember('ad8');
eq((await action('admin.members.deleteMember', [dm.id], admin)).result, { success: true, refunded: 0 }, 'deleteMember: ok');
eq(sql(`select deleted_at is not null as deleted, ended_reason from members where id = ${q(dm.id)}`), [{ deleted: true, ended_reason: 'account_deleted' }], 'deleteMember is Delete my account: the row is kept, anonymised (QA2-02; 13-fixes-3 checks the rest)');
eq(audits('member.delete', dm.id).length, 1, 'audit: member.delete');
ok(sql(`select distinct admin_id from admin_audit where created_at >= ${q(since)}`).every((r) => r.admin_id === admin.adminId), 'every audit row names the admin');
void exec; void insertBooking;
done();
