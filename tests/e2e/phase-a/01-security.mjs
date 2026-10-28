// Brief section 8 security: with a member's own REST token (the anon key plus their JWT) against PostgREST
// at http://127.0.0.1:54321/rest/v1, a member cannot change their own status, dates or Stripe ids, cannot
// insert (or change, or delete) a booking, cannot read another member's bookings or any event address, and
// cannot call book_event. Their own profile fields still save (the Edit details flow).
import { done, eq, makeBooking, makeEvent, makeMember, memberSession, ok, q, rest, sql1 } from './lib.mjs';

const a = await makeMember('seca');
const b = await makeMember('secb');
const event = await makeEvent('secevent', { price: 0, address: 'Secret Hall, 1 Sample Road, Anytown AB1 2CD' });
const bookingA = await makeBooking(a, event);
const bookingB = await makeBooking(b, event);
const sa = await memberSession(a.email);

const before = sql1(`select membership_status, cancel_at, grace_until, payment_failed_at, ended_at, deleted_at, stripe_customer_id, stripe_subscription_id, email from members where id = ${q(a.id)}`);
const forbidden = {
  membership_status: 'cancelled',
  cancel_at: new Date().toISOString(),
  cancel_requested_at: new Date().toISOString(),
  payment_failed_at: new Date().toISOString(),
  grace_until: new Date(Date.now() + 86400000 * 365).toISOString(),
  paused_at: new Date().toISOString(),
  ended_at: new Date().toISOString(),
  ended_reason: 'admin_cancelled',
  deleted_at: new Date().toISOString(),
  stripe_customer_id: 'cus_stolen',
  stripe_subscription_id: 'sub_stolen',
  email: 'f.someone.else@example.com',
};
for (const [column, value] of Object.entries(forbidden)) {
  const r = await rest('PATCH', `members?id=eq.${a.id}`, sa, { [column]: value });
  ok(r.status === 401 || r.status === 403, `member cannot set their own members.${column} (HTTP ${r.status})`, r.json);
}
eq(sql1(`select membership_status, cancel_at, grace_until, payment_failed_at, ended_at, deleted_at, stripe_customer_id, stripe_subscription_id, email from members where id = ${q(a.id)}`), before, 'their row is unchanged');

const mixed = await rest('PATCH', `members?id=eq.${a.id}`, sa, { full_name: 'Sneaky', membership_status: 'active' });
ok(mixed.status === 401 || mixed.status === 403, 'a profile change mixed with a status change is refused whole');

const own = await rest('PATCH', `members?id=eq.${a.id}`, sa, { full_name: 'Seca Renamed', phone: '+447700900999', employer: 'Own Co', role_title: 'Lead', bio: 'Hi' });
ok(own.status === 200 && own.json?.[0]?.full_name === 'Seca Renamed', 'a member can still change their own profile fields', own);
const other = await rest('PATCH', `members?id=eq.${b.id}`, sa, { full_name: 'Hacked' });
ok(other.status === 200 && Array.isArray(other.json) && other.json.length === 0, 'a member cannot change another member (no rows)', other);
ok(sql1(`select full_name from members where id = ${q(b.id)}`).full_name !== 'Hacked', 'the other member is unchanged');
const readOther = await rest('GET', `members?id=eq.${b.id}&select=id,email`, sa);
eq(readOther.json, [], 'a member cannot read another member');
const insertMember = await rest('POST', 'members', sa, { id: a.id, email: 'x@example.com' });
ok(insertMember.status === 401 || insertMember.status === 403 || insertMember.status === 409, `a member cannot insert a members row (HTTP ${insertMember.status})`);
const deleteMember = await rest('DELETE', `members?id=eq.${a.id}`, sa);
ok(deleteMember.status === 401 || deleteMember.status === 403, `a member cannot delete their members row (HTTP ${deleteMember.status})`);

const event2 = await makeEvent('secevent2', { price: 0 });
const insert = await rest('POST', 'bookings', sa, { member_id: a.id, event_id: event2.id, status: 'confirmed' });
ok(insert.status === 401 || insert.status === 403, `a member cannot insert a booking (HTTP ${insert.status})`, insert.json);
eq(sql1(`select count(*)::int as n from bookings where event_id = ${q(event2.id)}`).n, 0, 'no booking row was made');
const upd = await rest('PATCH', `bookings?id=eq.${bookingA.id}`, sa, { status: 'cancelled', refund_status: 'succeeded' });
ok(upd.status === 401 || upd.status === 403, `a member cannot change their own booking (HTTP ${upd.status})`);
const del = await rest('DELETE', `bookings?id=eq.${bookingA.id}`, sa);
ok(del.status === 401 || del.status === 403, `a member cannot delete their own booking (HTTP ${del.status})`);
eq(sql1(`select status from bookings where id = ${q(bookingA.id)}`).status, 'confirmed', 'their booking is unchanged');

const mine = await rest('GET', `bookings?select=id,member_id&event_id=eq.${event.id}`, sa);
eq(mine.json.map((r) => r.id), [bookingA.id], 'a member reads only their own bookings');
const theirs = await rest('GET', `bookings?member_id=eq.${b.id}&select=id`, sa);
eq(theirs.json, [], `a member cannot read another member's bookings (booking ${bookingB.id})`);

const addr = await rest('GET', 'event_addresses?select=event_id,address', sa);
ok((addr.status === 200 && addr.json.length === 0) || addr.status === 401 || addr.status === 403, 'a member cannot read any event address, even with a booking', addr);
const addrIns = await rest('POST', 'event_addresses', sa, { event_id: event2.id, address: 'x' });
ok(addrIns.status === 401 || addrIns.status === 403, 'a member cannot write an event address');
const eventsRead = await rest('GET', `events?id=eq.${event.id}&select=*`, sa);
ok(eventsRead.status === 200 && eventsRead.json.length === 1 && !('address' in eventsRead.json[0]), 'events rows carry no address');

const rpc = await rest('POST', 'rpc/book_event', sa, { p_member: a.id, p_event: event2.id, p_amount: 0, p_payment_intent: null, p_allow_over_capacity: true });
ok(rpc.status === 401 || rpc.status === 403 || rpc.status === 404, `a member cannot call book_event (HTTP ${rpc.status})`, rpc.json);
const rpcApprove = await rest('POST', 'rpc/approve_application_and_create_member', sa, { p_application_id: a.id, p_auth_user_id: a.id, p_reviewed_by: 'x' });
ok(rpcApprove.status === 401 || rpcApprove.status === 403 || rpcApprove.status === 404, 'nor approve_application_and_create_member');

for (const table of ['message_log', 'admin_audit']) {
  const r = await rest('GET', `${table}?select=id`, sa);
  ok((r.status === 200 && r.json.length === 0) || r.status === 401 || r.status === 403, `a member reads nothing from ${table}`);
}
const se = await rest('GET', 'stripe_events?select=id', sa);
ok(se.status === 401 || se.status === 403, `a member cannot read stripe_events (HTTP ${se.status})`);

for (const table of ['members', 'bookings', 'event_addresses', 'message_log', 'admin_audit']) {
  const r = await rest('GET', `${table}?select=*&limit=1`, null);
  ok((r.status === 200 && r.json.length === 0) || r.status === 401 || r.status === 403, `anon reads nothing from ${table}`);
}
const anonIns = await rest('POST', 'bookings', null, { member_id: a.id, event_id: event2.id });
ok(anonIns.status === 401 || anonIns.status === 403, 'anon cannot insert a booking');
done();
