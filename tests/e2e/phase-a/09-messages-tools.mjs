// The message service (brief 5.2): every send in message_log, from Club Yuppie with reply-to and a text
// part, a failed send logged (and never failing the action), a repeated dedupe key skipped; and the test
// tools: totp.mjs (RFC 6238 vectors), seed.mjs (idempotent, every state), login-admin.mjs (real page, aal2).
import { execFileSync } from 'node:child_process';
import {
  action, done, eq, fakeState, fakesMark, fakesSince, fd, makeEvent, makeMember, memberSession, messages, ok, q, sql, sql1, waitFor,
} from './lib.mjs';

// ---- a failed send is logged, the booking still stands
const bad = await makeMember('msgfail', 'active', {});
const failEmail = bad.email.replace('@', '+fail@');
await (await import('./lib.mjs')).svc.from('members').update({ email: failEmail }).eq('id', bad.id);
const sb = await memberSession(bad.email).catch(() => null);
const ev = await makeEvent('msgev', { price: 0 });
const session = sb ?? (await memberSession(bad.email));
const r = await action('events.rsvpToEvent', [fd({ event_id: ev.id })], session);
ok(r.result.success, 'the booking succeeds even though its email will be refused');
const failed = await waitFor(() => messages(`booking_id = ${q(r.result.bookingId)} and template = 'booking-confirmed-included' and status = 'failed'`)[0], 'the refused email is logged as failed');
ok(/Resend error \(422\)/.test(failed.error ?? ''), 'with the provider’s error', failed);

// ---- what a sent email carries (C-D6) and the dedupe key
const good = await makeMember('msgok');
const sg = await memberSession(good.email);
const mark = fakesMark();
const r2 = await action('events.rsvpToEvent', [fd({ event_id: ev.id })], sg);
const row = await waitFor(() => messages(`booking_id = ${q(r2.result.bookingId)} and status = 'sent'`)[0], 'the confirmation is logged as sent');
eq(row.dedupe_key, `booking-confirmed:${r2.result.bookingId}`, 'with its dedupe key');
eq([row.member_id, row.event_id, row.to_address], [good.id, ev.id, good.email], 'and the member, event and address');
ok(sql1(`select provider_id from message_log where dedupe_key = ${q(row.dedupe_key)}`).provider_id, 'and the Resend id');
const st = await fakeState();
const mail = st.emails.find((e) => [].concat(e.to).includes(good.email));
eq([mail.from, mail.reply_to], ['Club Yuppie <noreply@clubyuppie.com>', 'hello@clubyuppie.com'], 'from Club Yuppie, reply-to hello@clubyuppie.com');
ok(mail.html?.includes('<html') && mail.text?.length > 50 && mail.subject, 'with a subject, the designed HTML and a plain-text part', { subject: mail.subject });
ok(!/Club Yuppie: booking-confirmed/.test(mail.subject), 'rendered by lib/emails, not the stand-in');
eq(fakesSince(mark, 'email').filter((e) => [].concat(e.to).includes(good.email)).length, 1, 'one email');
const dupKeys = sql(`select dedupe_key, count(*)::int as n from message_log where dedupe_key is not null group by 1 having count(*) > 1`);
eq(dupKeys, [], 'no dedupe key appears twice in message_log');

// ---- the tools
const tools = '/home/claude/stack/tools';
const env = { ...process.env };
eq(execFileSync('node', [`${tools}/totp.mjs`], { encoding: 'utf8', env }).trim(), 'self-test ok', 'totp.mjs passes the RFC 6238 SHA-1 vectors');
const seed1 = JSON.parse(execFileSync('node', [`${tools}/seed.mjs`, '--prefix', 'f.', '--quiet'], { encoding: 'utf8', env }));
const seed2 = JSON.parse(execFileSync('node', [`${tools}/seed.mjs`, '--prefix', 'f.', '--quiet'], { encoding: 'utf8', env }));
eq(Object.keys(seed1.members).sort(), ['active', 'ended', 'ending', 'filler1', 'filler2', 'lapsed', 'paused', 'problem'], 'seed.mjs: members in every state');
eq(Object.keys(seed1.events).sort(), ['cancelled', 'changed', 'full', 'included', 'late', 'paid', 'past'], 'seed.mjs: paid, included, full, past, cancelled, changed (and late) events');
eq([seed2.members.active.id, seed2.events.paid.id, seed2.bookings.activePaid, seed2.admin.factorId], [seed1.members.active.id, seed1.events.paid.id, seed1.bookings.activePaid, seed1.admin.factorId], 'seed.mjs again: the same rows, nothing doubled');
eq(sql1(`select count(*)::int as n from bookings where member_id = ${q(seed1.members.active.id)} and event_id = ${q(seed1.events.paid.id)} and status = 'confirmed'`).n, 1, 'one paid booking for the active member');
eq(sql1(`select count(*)::int as n from event_addresses where event_id in (${Object.values(seed1.events).map((e) => q(e.id)).join(',')})`).n, 7, 'every seed event has an address');
const states = sql(`select email, membership_status, cancel_at is not null as c, payment_failed_at is not null as p from members where email like 'f.%@example.com' and email in (${Object.values(seed1.members).map((m) => q(m.email)).join(',')})`);
ok(states.find((s) => s.email === 'f.paused@example.com').membership_status === 'paused' && states.find((s) => s.email === 'f.problem@example.com').p && states.find((s) => s.email === 'f.ending@example.com').c, 'the states are set', states);
const login = JSON.parse(execFileSync('node', [`${tools}/login-admin.mjs`, '--prefix', 'f.', '--base', process.env.PHASE_A_BASE || 'http://localhost:3141'], { encoding: 'utf8', env, timeout: 120000 }).trim().split('\n').pop());
eq([login.ok, login.aal, new URL(login.url).pathname], [true, 'aal2', '/admin'], 'login-admin.mjs: through /admin/login to aal2');
done();
