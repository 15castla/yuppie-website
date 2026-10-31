// The reminders job for plans and texts (brief 2.3; notifications 3.6 and decision 2 B), on a fake clock
// (GET /api/cron/reminders?now=..., test hooks only): 24 hours and 2 hours before a plan, an Update, an email and
// a text by each member's switches; nobody who joined inside a window; quiet hours hold a text due from 22:00
// to 07:00 and send it at 07:00 with "today" in its words if the start is more than an hour away, otherwise skip
// it; email is never held; club-event reminders by text too; a moved plan starts its reminders again; nothing
// is sent twice, even with two runs at once.
import { action, cronAt, done, eq, exec, fakesMark, fakesSince, logRows, makeEvent, makeMemberWithPhoto, makeBooking, ok, postPlan, q, sql, sql1 } from './lib.mjs';

const MIN = 60000;
const HOUR = 60 * MIN;
// The instant London's clock reads hh:mm, `days` from today (London).
function londonAt(days, hh, mm) {
  const d = new Date(Date.now() + days * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const guess = new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const wall = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(guess);
  const [h, m] = wall.split(':').map(Number);
  return new Date(guess.getTime() - ((h - hh) * 60 + (m - mm)) * MIN);
}
const formDate = (instant) => ({
  date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant),
  time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant),
});

const host = await makeMemberWithPhoto('rh');
const texter = await makeMemberWithPhoto('rt');
const lateJoin = await makeMemberWithPhoto('rl');
const lastMinute = await makeMemberWithPhoto('rv');
const no24 = await makeMemberWithPhoto('rn');
ok((await action('notifications.setNotificationChannel', ['text', true], texter.session)).result.ok, 'the texter switches Text on (the check text goes)');
ok((await action('notifications.setNotificationTopic', ['reminder24', false], no24.session)).result.ok, 'another member switches the 24-hour reminder off');
const join = (planId, who, joinedAt) => action('invite.joinOpenInvite', [planId], who.session).then(() => exec(`update plan_members set joined_at = to_timestamp(${joinedAt.getTime() / 1000}) where plan_id = ${q(planId)} and member_id = ${q(who.id)}`));
const post = (title, start) => postPlan(host, { title, places: 8, ...formDate(start) });
const sentFor = (where) => logRows(where).filter((r) => r.status === 'sent');
const texts = (mark, title) => fakesSince(mark, 'sms').filter((s) => s.body.includes(title));

// ---------------------------------------------------------------- A: 24 hours and 2 hours, at 18:00 in three days
const aStart = londonAt(3, 18, 0);
const A = await post('Reminder plan A', aStart);
await join(A, texter, new Date(aStart - 72 * HOUR));
await join(A, no24, new Date(aStart - 72 * HOUR));
await join(A, lateJoin, new Date(aStart - 10 * HOUR)); // inside the 24-hour window
await join(A, lastMinute, new Date(aStart - 1 * HOUR)); // inside the 2-hour window
exec(`update plan_members set joined_at = to_timestamp(${(aStart - 96 * HOUR) / 1000}) where plan_id = ${q(A)} and member_id = ${q(host.id)}`);
const mark1 = fakesMark();
const r24 = await cronAt('reminders', aStart - 23 * HOUR);
ok(r24.json.ok, '23 hours before (19:00 the day before): the job runs', r24.json);
const upd24 = sql(`select member_id from updates where plan_id = ${q(A)} and kind = 'reminder' and reminder_hours = 24`).map((r) => r.member_id).sort();
// Stage 2 fixes (QB2-09): the reminder Update follows the reminder's switch, so none for the member who switched the 24-hour reminder off.
eq(upd24, [host.id, texter.id].sort(), 'a 24-hour reminder Update for the host (going) and everyone in before the 24-hour mark; none for who joined later, nor for the member who switched it off');
eq(sentFor(`plan_id = ${q(A)} and template = 'plan-reminder' and channel = 'email'`).map((r) => r.member_id).sort(), [host.id, texter.id].sort(), 'the 24-hour email, but not to the member who switched the 24-hour reminder off');
const t24 = texts(mark1, 'Reminder plan A');
eq(t24.map((t) => t.body), ['Club Yuppie: Reminder plan A is tomorrow at 18:00, Calder Park. See the plan: localhost:3101/members'], 'the 24-hour text, to the member with Text on, in the approved words');
eq(sentFor(`plan_id = ${q(A)} and channel = 'sms'`).map((r) => r.dedupe_key), [`plan-reminder-text-24h:${A}:${texter.id}:${aStart.getTime()}`], 'logged with its own key');
const [p1, p2] = await Promise.all([cronAt('reminders', aStart - 23 * HOUR + MIN), cronAt('reminders', aStart - 23 * HOUR + MIN)]);
ok(p1.json.ok && p2.json.ok, 'two runs at once');
eq([sentFor(`plan_id = ${q(A)} and template = 'plan-reminder' and channel = 'email'`).length, sentFor(`plan_id = ${q(A)} and channel = 'sms'`).length, sql1(`select count(*)::int n from updates where plan_id = ${q(A)} and kind = 'reminder'`).n], [2, 1, 2], 'and still one of each');
const mark2 = fakesMark();
await cronAt('reminders', aStart - 110 * MIN);
eq(sql(`select member_id from updates where plan_id = ${q(A)} and kind = 'reminder' and reminder_hours = 2`).map((r) => r.member_id).sort(), [host.id, texter.id, no24.id, lateJoin.id].sort(), '110 minutes before (a run every 15 minutes): the 2-hour reminder for everyone in before the 2-hour mark (the later joiner too; not the last-minute one)');
eq(texts(mark2, 'Reminder plan A').map((t) => t.body), ['Club Yuppie: Reminder plan A starts in 2 hours, 18:00, Calder Park. See the plan: localhost:3101/members'], 'the 2-hour text, on time: "starts in 2 hours" (a text more than 20 minutes late says "today at" instead)');
eq(sentFor(`plan_id = ${q(A)} and template = 'plan-reminder' and channel = 'email'`).length, 2 + 4, 'and the 2-hour emails (four: the 2-hour switch is on for all)');
eq(logRows(`plan_id = ${q(A)} and member_id = ${q(lastMinute.id)}`).length, 0, 'nothing at all for the member who joined inside 2 hours');

// ---------------------------------------------------------------- B: 08:30, the 2-hour text due at 06:30 (quiet)
const bStart = londonAt(4, 8, 30);
const B = await post('Reminder plan B', bStart);
await join(B, texter, new Date(bStart - 72 * HOUR));
const mark3 = fakesMark();
await cronAt('reminders', londonAt(4, 6, 35));
eq(sentFor(`plan_id = ${q(B)} and member_id = ${q(texter.id)} and channel = 'email'`).length, 1, '06:35: the 2-hour email goes (email is not held)');
eq(texts(mark3, 'Reminder plan B').length, 0, 'the text is held for quiet hours');
eq(logRows(`plan_id = ${q(B)} and channel = 'sms'`).map((r) => [r.status, r.error]), [['skipped', 'quiet hours: held until 07:00']], 'logged as held');
await cronAt('reminders', londonAt(4, 7, 5));
eq(texts(mark3, 'Reminder plan B').map((t) => t.body), ['Club Yuppie: Reminder plan B is today at 08:30, Calder Park. See the plan: localhost:3101/members'], '07:05: the held text goes, saying "today at 08:30" (more than an hour to go)');
eq(logRows(`plan_id = ${q(B)} and channel = 'sms'`).map((r) => r.status), ['sent'], 'its row now reads sent');

// ---------------------------------------------------------------- C: 07:45, the held text would land with under an hour to go
const cStart = londonAt(4, 7, 45);
const C = await post('Reminder plan C', cStart);
await join(C, texter, new Date(cStart - 72 * HOUR));
const mark4 = fakesMark();
await cronAt('reminders', londonAt(4, 5, 50));
await cronAt('reminders', londonAt(4, 7, 5));
eq(texts(mark4, 'Reminder plan C').length, 0, 'an 07:45 plan: the 2-hour text due at 05:45 is never sent (40 minutes to go at 07:00)');
eq(logRows(`plan_id = ${q(C)} and channel = 'sms'`).map((r) => [r.status, r.error]), [['skipped', 'quiet hours: under an hour to go at 07:00, so skipped']], 'logged as skipped');
await cronAt('reminders', londonAt(4, 7, 20));
eq(texts(mark4, 'Reminder plan C').length, 0, 'and later runs leave it');
eq(sentFor(`plan_id = ${q(C)} and member_id = ${q(texter.id)} and channel = 'email'`).length, 1, 'the email went at 05:50 all the same');

// ---------------------------------------------------------------- D: 23:30, the 24-hour text due at 23:30 the night before
const dStart = londonAt(5, 23, 30);
const D = await post('Reminder plan D', dStart);
await join(D, texter, new Date(dStart - 72 * HOUR));
const mark5 = fakesMark();
await cronAt('reminders', londonAt(4, 23, 35));
eq(texts(mark5, 'Reminder plan D').length, 0, '23:35 the night before: the 24-hour text is held');
eq(sentFor(`plan_id = ${q(D)} and member_id = ${q(texter.id)} and channel = 'email'`).length, 1, 'the 24-hour email goes');
await cronAt('reminders', londonAt(5, 7, 5));
eq(texts(mark5, 'Reminder plan D').map((t) => t.body), ['Club Yuppie: Reminder plan D is today at 23:30, Calder Park. See the plan: localhost:3101/members'], '07:05 on the day: it goes, "today at 23:30"');

// ---------------------------------------------------------------- a moved plan starts its reminders again
const eStart = londonAt(3, 12, 0);
const E = await post('Reminder plan E', eStart);
await join(E, texter, new Date(eStart - 72 * HOUR));
await cronAt('reminders', eStart - 23 * HOUR);
eq(sentFor(`plan_id = ${q(E)} and member_id = ${q(texter.id)} and channel = 'email'`).length, 1, 'the 24-hour email for the old time');
const newStart = new Date(eStart.getTime() + 24 * HOUR);
const moved = await action('plan.editOpenInvite', [E, { title: 'Reminder plan E', type: 'Sport', ...formDate(newStart), where: 'Calder Park', places: 8, hostGoing: true, note: '', cost: null }], host.session);
ok(moved.result.ok, 'the host moves it a day later');
eq(sql1(`select reminder_24h_sent_at from plan_members where plan_id = ${q(E)} and member_id = ${q(texter.id)}`).reminder_24h_sent_at, null, 'its reminder claims start again');
await cronAt('reminders', newStart - 23 * HOUR);
eq(sentFor(`plan_id = ${q(E)} and member_id = ${q(texter.id)} and channel = 'email' and template = 'plan-reminder'`).length, 2, 'and the 24-hour email comes again for the new time');

// ---------------------------------------------------------------- club events, by text too
const ev = await makeEvent('remtext', { price: 0, startInHours: 72 });
const evStart = new Date(sql1(`select start_time from events where id = ${q(ev.id)}`).start_time);
const booking = await makeBooking(texter, ev, { bookedAgoHours: 1 });
exec(`update bookings set booked_at = to_timestamp(${(evStart - 96 * HOUR) / 1000}) where id = ${q(booking.id)}`);
const mark6 = fakesMark();
const evRun = await cronAt('reminders', evStart - 23 * HOUR);
ok(evRun.json.ok, 'the job runs for the event');
const evTexts = texts(mark6, ev.title);
// Quiet hours may hold it, depending on when the event's 24-hour mark falls on the London clock.
const quiet = (() => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(evStart - 23 * HOUR))); return h >= 22 || h < 7; })();
if (quiet) eq(logRows(`booking_id = ${q(booking.id)} and channel = 'sms'`).map((r) => r.status), ['skipped'], 'a club event\'s 24-hour text in quiet hours: held');
else eq(evTexts.length === 1 && /^Club Yuppie: .+ is tomorrow at \d\d:\d\d, .+\. See your booking: localhost:3101\/members$/.test(evTexts[0].body), true, 'a club event\'s 24-hour text, in the approved words');
eq(sentFor(`booking_id = ${q(booking.id)} and template = 'event-reminder' and channel = 'email'`).map((r) => r.dedupe_key), [`event-reminder-24h:${booking.id}`], 'and its email, with stage 1\'s key');
done();
