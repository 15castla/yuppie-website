// The Outreach Desk, Phase 1 (17 Nov 2026; plan docs/plans/outreach-desk.md): the owner-only partner record, against
// the local stack and a production build (tests/e2e/phase-b/server.sh build, then start).
//   who gets in: the owner (aal2) only; no session and an aal1 admin go to Log in, a member goes home, an admin who
//     isn't the owner gets "You don't have access to this page." and no Desk link; every page (also as an RSC
//     request) and every desk action is refused the same way and changes nothing; REST gives nobody but the service
//     role a single outreach row; nobody can make themselves the owner;
//   the record: a partner, contacts, an email (with a new address), a follow-up, a reply, a bounce and a resend, a
//     letter, notes and action points; the follow-up engine's dates (7 working days after an email, 10 after a
//     letter, Christmas skipped, the January round), pausing on a bounce, stopping on a reply or an opt-out, snooze,
//     skip, pause, resume and stop; the KPIs, the blotter and Today on the pages;
//   privacy: opted-out people can't be written to; deleting a person clears their address and words; deleting a
//     partner removes everything; the audit rows hold ids and counts, never a name or an address;
//   the import: a file is imported once (a second import changes nothing and says so); six partners at once each keep
//     their own history and dates.
//   node tests/e2e/phase-b/24-outreach-desk.mjs     (needs: seed.mjs --prefix bf. and --prefix dk.; bf. the owner)
import fs from 'node:fs';
import {
  ANON, BASE, SUPA, action, adminSession, cookieFor, done, eq, exec, fd, fileArg, makeMember, memberSession, ok, q, rand, rest, sql, sql1,
} from './lib.mjs';
import { jwtClaims } from '/home/claude/stack/tools/login-admin.mjs';

const RUN = rand();
const MARK = `Q${RUN}`;
const DESK = (name) => `admin.desk.${name}`;

// the owner is bf.; dk. is another admin (Kira)
const ownerSaved = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-bf.json', 'utf8'));
const otherSaved = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-dk.json', 'utf8'));
exec(`update admin_users set is_owner = false where is_owner; update admin_users set is_owner = true where id = ${q(ownerSaved.userId)}`);
const owner = await adminSession('bf.');
const other = await adminSession('dk.');
ok(jwtClaims(owner.access_token).aal === 'aal2' && jwtClaims(other.access_token).aal === 'aal2', 'both admins have aal2 sessions');

const run = (name, fields, session = owner) => action(DESK(name), [fd(fields)], session);
const idFrom = (redirect) => /\/admin\/desk\/t\/([0-9a-f-]{36})/.exec(redirect ?? '')?.[1];
// (not "t": the helper wraps the query as a subquery named t, and a column t would be taken for the row)
const counts = () => sql1(`select (select count(*) from outreach_targets)::int tg, (select count(*) from outreach_contacts)::int c, (select count(*) from outreach_touches)::int x,
  (select count(*) from outreach_outcomes)::int o, (select count(*) from outreach_followups)::int f, (select count(*) from outreach_notes)::int n, (select count(*) from outreach_actions)::int a`);

// ============================================================================================ the record
const created = await run('deskCreateTarget', {
  name: `${MARK} Barbers`, category: 'grooming', domains: 'https://www.example-barbers.test/, example-barbers.test', ask: 'extend_corporate_offer', ask_line: 'a members\u2019 rate',
  stage: 'researching', contact_name: `${MARK} Richard`, contact_role: 'Founder', contact_email: `${MARK.toLowerCase()}.r@example-barbers.test`, contact_mailbox_type: 'founder', contact_source: 'rocketreach',
});
const T1 = idFrom(created.redirect);
ok(T1 && created.redirect.endsWith('?done=created'), 'New partner: saved, and the browser goes to their page', created);
const t1 = sql1(`select name, category, domains, stage from outreach_targets where id = ${q(T1)}`);
eq(t1.domains, ['example-barbers.test'], 'domains are cleaned (scheme, www and repeats dropped)');
eq(t1.stage, 'researching', 'the chosen stage');
const richard = sql1(`select id, email, email_source, is_primary from outreach_contacts where target_id = ${q(T1)}`);
ok(richard && richard.email_source === 'rocketreach' && richard.is_primary, 'its first contact, with where the address came from');

// an email to the contact and to a new address typed in (a group mailbox, published), cc
let r = await run('deskLogTouch', {
  target: T1, back: `/admin/desk/t/${T1}`, channel: 'email', kind: 'first', sent_at: '2026-11-12T09:40', to: richard.id,
  new_email: `${MARK.toLowerCase()}.team@example-barbers.test`, new_mailbox_type: 'group_mailbox', new_source: 'published', subject: `${MARK} partnership`, body_text: `Dear ${MARK} team, the whole email`,
});
ok(r.redirect === `/admin/desk/t/${T1}?done=touch`, 'Log an email: saved', r);
const first = sql1(`select id, sequence_id, step, status, sent_at, body_text from outreach_touches where target_id = ${q(T1)}`);
ok(first.id === first.sequence_id && first.step === 0 && first.status === 'sent', 'a first email starts its own sequence, step 0, sent');
eq(first.sent_at, '2026-11-12T09:40:00+00:00', 'the UK time typed is kept as the moment (GMT in November)');
ok(first.body_text.includes('the whole email'), 'the whole email is kept');
eq(sql(`select role, address is not null as has from outreach_touch_recipients where touch_id = ${q(first.id)} order by role desc`).length, 2, 'two recipients: the contact and the new address');
eq(sql1(`select email_source, mailbox_type from outreach_contacts where target_id = ${q(T1)} and email like '%.team@%'`), { email_source: 'published', mailbox_type: 'group_mailbox' }, 'the new address became a contact, with its source');
let fu = sql(`select step, due_on, status from outreach_followups where sequence_id = ${q(first.id)}`);
eq(fu, [{ step: 1, due_on: '2026-11-23', status: 'scheduled' }], 'the follow-up: 7 working days after Thu 12 Nov is Mon 23 Nov');
eq(sql1(`select stage from outreach_targets where id = ${q(T1)}`).stage, 'contacted', 'a first email moves Researching to Contacted');
eq(sql1(`select at from outreach_stage_history where target_id = ${q(T1)} and to_stage = 'contacted'`).at, '2026-11-12T09:40:00+00:00', 'the stage change is dated when the email went');

// the follow-up goes: the January email is scheduled in the round
r = await run('deskLogTouch', { target: T1, channel: 'email', kind: 'follow_up', sent_at: '2026-11-23T10:00', to: richard.id });
fu = sql(`select step, due_on, status from outreach_followups where sequence_id = ${q(first.id)} order by step`);
eq(fu[0].status, 'done', 'logging the follow-up closes step 1');
ok(fu[1] && fu[1].step === 2 && ['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15'].includes(fu[1].due_on) && fu[1].status === 'scheduled', 'and schedules the January email in the week of 11 Jan', fu[1]);
eq(sql1(`select step from outreach_touches where sequence_id = ${q(first.id)} and kind = 'follow_up'`).step, 1, 'the follow-up email is step 1');

// a reply: the first in the sequence, its reply time, the January email stops, Contacted becomes Replied
r = await run('deskLogOutcome', { target: T1, kind: 'reply', channel: 'email', from_contact: richard.id, received_at: '2026-11-23T17:30', sentiment: 'positive', body_text: `${MARK} happy to talk` });
ok(r.redirect?.endsWith('?done=outcome'), 'Log a reply: saved');
const reply = sql1(`select is_first_reply, reply_seconds, sequence_id, touch_id, body_text from outreach_outcomes where target_id = ${q(T1)}`);
ok(reply.is_first_reply && reply.sequence_id === first.id, 'the first reply of the sequence');
eq(reply.reply_seconds, 7.5 * 3600, 'its reply time is from the email it answered (the follow-up, 7.5 hours before)');
eq(sql1(`select status, reason from outreach_followups where sequence_id = ${q(first.id)} and step = 2`), { status: 'cancelled', reason: 'replied' }, 'a reply stops the January email');
eq(sql1(`select stage from outreach_targets where id = ${q(T1)}`).stage, 'replied', 'Contacted becomes Replied');

// a call booked from a reply's form: the stage, the next call and an action point
r = await run('deskLogOutcome', { target: T1, kind: 'reply', channel: 'email', from_contact: richard.id, received_at: '2026-11-24T09:00', call_at: '2026-11-27T12:00' });
eq(sql1(`select stage, next_call_at from outreach_targets where id = ${q(T1)}`), { stage: 'call_booked', next_call_at: '2026-11-27T12:00:00+00:00' }, 'a call booked sets the stage and the next call');
ok(sql1(`select count(*)::int n from outreach_actions where target_id = ${q(T1)} and kind = 'call' and starts_at = '2026-11-27T12:00:00Z'`).n === 1, 'and puts the call on the agenda');
eq(sql1(`select is_first_reply from outreach_outcomes where target_id = ${q(T1)} and received_at = '2026-11-24T09:00:00Z'`).is_first_reply, false, 'a later reply is not the first');

// notes and action points
r = await run('deskAddNote', { target: T1, kind: 'meeting', happened_at: '2026-11-27T12:30', title: 'Call', body: `${MARK} will give members a discount` });
ok(r.redirect?.endsWith('?done=note') && sql1(`select count(*)::int n from outreach_notes where target_id = ${q(T1)}`).n === 1, 'meeting notes saved');
r = await run('deskAddAction', { target: T1, kind: 'task', title: `${MARK} send the thank-you`, due_on: '2026-11-17' });
const act = sql1(`select id, status from outreach_actions where target_id = ${q(T1)} and kind = 'task'`);
ok(act && act.status === 'open', 'an action point, open');
r = await run('deskSetAction', { action: act.id, op: 'done' });
eq(sql1(`select status from outreach_actions where id = ${q(act.id)}`).status, 'done', 'ticked off');
r = await run('deskRateOutcome', { outcome: sql1(`select id from outreach_outcomes where target_id = ${q(T1)} and received_at = '2026-11-24T09:00:00Z'`).id, sentiment: 'neutral' });
ok(r.redirect?.endsWith('?done=saved'), 'a reply is rated');

// ============================================================================================ bounces, letters, Christmas
const t2 = await run('deskCreateTarget', { name: `${MARK} Salon`, category: 'hair_beauty', contact_email: `${MARK.toLowerCase()}.guess@example-salon.test`, contact_source: 'guessed', contact_mailbox_type: 'group_mailbox' });
const T2 = idFrom(t2.redirect);
const guess = sql1(`select id from outreach_contacts where target_id = ${q(T2)}`).id;
await run('deskLogTouch', { target: T2, channel: 'email', kind: 'first', sent_at: '2026-11-11T08:00', to: guess });
const seq2 = sql1(`select id from outreach_touches where target_id = ${q(T2)}`).id;
eq(sql1(`select due_on from outreach_followups where sequence_id = ${q(seq2)}`).due_on, '2026-11-20', '7 working days after Wed 11 Nov is Fri 20 Nov');
await run('deskLogOutcome', { target: T2, kind: 'bounce', channel: 'email', from_contact: '', received_at: '2026-11-11T08:05', bounced_address: `${MARK.toLowerCase()}.guess@example-salon.test`, bounce_code: '5.1.1' });
eq(sql1(`select delivery, bounce_code from outreach_touch_recipients where touch_id = ${q(seq2)}`), { delivery: 'bounced', bounce_code: '5.1.1' }, 'a bounce marks the address on the email');
eq(sql1(`select email_status from outreach_contacts where id = ${q(guess)}`).email_status, 'bounced', 'and on the contact');
eq(sql1(`select status, reason from outreach_followups where sequence_id = ${q(seq2)}`), { status: 'paused', reason: 'bounced' }, 'every address bounced: the follow-up waits');
await run('deskLogTouch', { target: T2, channel: 'email', kind: 'resend', sent_at: '2026-11-12T08:00', new_email: `${MARK.toLowerCase()}.real@example-salon.test`, new_source: 'published', sequence: seq2 });
eq(sql1(`select status, due_on from outreach_followups where sequence_id = ${q(seq2)}`), { status: 'scheduled', due_on: '2026-11-23' }, 'a resend restarts the follow-up from the resend (Mon 23 Nov)');
eq(sql1(`select count(distinct sequence_id)::int n from outreach_touches where target_id = ${q(T2)}`).n, 1, 'and stays one approach');

const t3 = await run('deskCreateTarget', { name: `${MARK} Tailors`, category: 'clothing', contact_name: `${MARK} Owner`, contact_mailbox_type: 'named_person' });
const T3 = idFrom(t3.redirect);
const ownerContact = sql1(`select id from outreach_contacts where target_id = ${q(T3)}`).id;
r = await run('deskLogTouch', { target: T3, channel: 'letter', kind: 'first', posted_on: '2026-11-09', to: ownerContact, letter_class: 'first' });
const letter = sql1(`select id, status, letter_posted_on, sent_at from outreach_touches where target_id = ${q(T3)}`);
eq({ status: letter.status, posted: letter.letter_posted_on }, { status: 'posted', posted: '2026-11-09' }, 'Letter posted: logged as posted on its date');
eq(sql1(`select due_on, channel from outreach_followups where sequence_id = ${q(letter.id)}`), { due_on: '2026-11-23', channel: 'email' }, 'a letter\u2019s follow-up is an email 10 working days after posting (Mon 23 Nov)');

const t4 = await run('deskCreateTarget', { name: `${MARK} Gym`, category: 'fitness', contact_email: `${MARK.toLowerCase()}@example-gym.test`, contact_source: 'apollo' });
const T4 = idFrom(t4.redirect);
const gym = sql1(`select id from outreach_contacts where target_id = ${q(T4)}`).id;
await run('deskLogTouch', { target: T4, channel: 'email', kind: 'first', sent_at: '2026-12-17T10:00', to: gym });
eq(sql1(`select f.due_on from outreach_followups f join outreach_touches t on t.sequence_id = f.sequence_id where t.target_id = ${q(T4)}`).due_on, '2027-01-11', 'Christmas: 7 working days after Thu 17 Dec skips 21 Dec to 1 Jan (Mon 11 Jan)');

// ============================================================================================ follow-up controls
const f4 = sql1(`select f.id from outreach_followups f where f.target_id = ${q(T4)}`).id;
await run('deskFollowup', { followup: f4, op: 'snooze', until: '2027-01-14' });
eq(sql1(`select snoozed_until from outreach_followups where id = ${q(f4)}`).snoozed_until, '2027-01-14', 'Snooze to a date');
await run('deskFollowup', { followup: f4, op: 'unsnooze' });
await run('deskFollowup', { followup: f4, op: 'pause' });
eq(sql1(`select status from outreach_followups where id = ${q(f4)}`).status, 'paused', 'Pause');
await run('deskFollowup', { followup: f4, op: 'resume' });
eq(sql1(`select status from outreach_followups where id = ${q(f4)}`).status, 'scheduled', 'Resume');
await run('deskFollowup', { followup: f4, op: 'skip' });
const after = sql(`select step, status from outreach_followups where target_id = ${q(T4)} order by step`);
ok(after[0].status === 'skipped' && after[1]?.step === 2 && after[1].status === 'scheduled', 'Skip the follow-up: it is skipped and the January email still comes', after);
await run('deskFollowup', { followup: sql1(`select id from outreach_followups where target_id = ${q(T4)} and step = 2`).id, op: 'stop' });
eq(sql1(`select status, reason from outreach_followups where target_id = ${q(T4)} and step = 2`), { status: 'cancelled', reason: 'manual' }, 'Stop follow-ups');

// ============================================================================================ opt-out and deletion
await run('deskSaveContact', { target: T2, contact: guess, name: '', email: `${MARK.toLowerCase()}.guess@example-salon.test`, mailbox_type: 'group_mailbox', email_source: 'guessed', opted_out: 'on' });
eq(sql1(`select status, reason from outreach_followups where sequence_id = ${q(seq2)}`), { status: 'cancelled', reason: 'opted_out' }, 'an opt-out stops the follow-ups');
const before = counts();
r = await run('deskLogTouch', { target: T2, channel: 'email', kind: 'first', sent_at: '2026-11-25T10:00', to: guess });
ok(r.redirect?.endsWith('?error=opted_out') && counts().x === before.x, 'nothing can be sent to someone who opted out (refused, nothing logged)', r);
await run('deskSetFlags', { target: T3, op: 'opt_out' });
r = await run('deskLogTouch', { target: T3, channel: 'letter', kind: 'first', posted_on: '2026-11-25', to: ownerContact });
ok(r.redirect?.endsWith('?error=opted_out'), 'nor to a business that opted out');
eq(sql1(`select count(*)::int n from outreach_followups where target_id = ${q(T3)} and status in ('scheduled','drafted','paused')`).n, 0, 'its follow-ups are stopped');

r = await run('deskDeleteContact', { target: T1, contact: richard.id });
ok(r.redirect?.endsWith('?error=confirm'), 'Delete person needs the confirmation tick');
r = await run('deskDeleteContact', { target: T1, contact: richard.id, confirm: 'delete' });
ok(r.redirect?.endsWith('?done=contact_deleted'), 'Delete person: done');
eq(sql1(`select count(*)::int n from outreach_contacts where id = ${q(richard.id)}`).n, 0, 'their contact row is gone');
eq(sql1(`select count(*)::int n from outreach_touch_recipients r join outreach_touches t on t.id = r.touch_id where t.target_id = ${q(T1)} and r.address like '%.r@%'`).n, 0, 'their address is cleared from every email');
eq(sql1(`select count(*)::int n from outreach_outcomes where target_id = ${q(T1)} and (body_text is not null or from_address is not null or from_name is not null)`).n, 0, 'and what they wrote, with their name and address');
eq(sql1(`select count(*)::int n from outreach_touches where target_id = ${q(T1)}`).n, 2, 'the emails themselves stay (the numbers don\u2019t change)');

// ============================================================================================ the pages
const page = async (path, session, headers = {}) => {
  const h = { ...(session ? { cookie: cookieFor(session) } : {}), ...headers };
  let res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: h });
  // an RSC request is first sent to the same address with its cache-busting _rsc= (as the router does)
  if (headers.RSC && res.status === 307 && /_rsc/.test(res.headers.get('location') ?? '')) res = await fetch(new URL(res.headers.get('location'), BASE), { redirect: 'manual', headers: h });
  return { status: res.status, location: res.headers.get('location'), body: await res.text() };
};
const home = await page('/admin/desk', owner);
ok(home.status === 200 && home.body.includes(`${MARK} Barbers`) && home.body.includes('Response rate') && home.body.includes('Blotter'), 'the desk home: KPIs and the blotter with the partner');
const filtered = await page(`/admin/desk?channel=letter&q=${MARK}`, owner);
ok(filtered.body.includes(`${MARK} Tailors`) && !filtered.body.includes(`${MARK} Barbers</a>`), 'the blotter filters (letters, by name)');
const tPage = await page(`/admin/desk/t/${T1}`, owner);
ok(tPage.status === 200 && tPage.body.includes('Timeline') && tPage.body.includes(`${MARK} will give members a discount`), 'the partner page: the timeline with the notes');
const today = await page('/admin/desk/today', owner);
ok(today.status === 200 && today.body.includes('The next five working days'), 'Today');
const partners = await page(`/admin/desk/partners?q=${MARK}`, owner);
ok(partners.body.includes(`${MARK} Salon`) && partners.body.includes(`${MARK} Gym`), 'Partners: found by name');
const adminHome = await page('/admin', owner);
ok(adminHome.body.includes('href="/admin/desk"'), 'the owner has the Desk link');
const otherHome = await page('/admin', other);
ok(otherHome.status === 200 && !otherHome.body.includes('href="/admin/desk"'), 'another admin has no Desk link');

// ============================================================================================ who gets in
async function passwordSession(email) {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'local-admin-password-1' }) });
  return res.json();
}
const aal1 = await passwordSession(ownerSaved.email);
eq(jwtClaims(aal1.access_token).aal, 'aal1', 'the owner with the password only has an aal1 session');
const member = await makeMember(`${MARK}m`);
const memberSess = member.session ?? (await memberSession(member.email));
const leaks = (body) => body.includes(MARK) || body.includes('Outreach desk');
const target = (res) => res.location ? new URL(res.location, BASE).pathname : (/NEXT_REDIRECT;(?:replace|push);([^;"\\]+);/.exec(res.body)?.[1] ?? null);
const PAGES = ['/admin/desk', '/admin/desk/today', '/admin/desk/partners', '/admin/desk/new', '/admin/desk/settings', `/admin/desk/t/${T1}`];
const WHO = [['no session', null, '/admin/login'], ['the owner with aal1', aal1, '/admin/login'], ['a member', memberSess, '/'], ['another admin (aal2)', other, '/admin/no-access']];
for (const p of PAGES) {
  for (const [label, sess, where] of WHO) {
    for (const rsc of [false, true]) {
      const res = await page(p, sess, rsc ? { RSC: '1' } : {});
      const to = target(res);
      ok(to && new URL(to, BASE).pathname === where && !leaks(res.body), `${p}${rsc ? ' (RSC)' : ''}, ${label}: sent to ${where}, nothing of the desk`, { status: res.status, to, body: res.body.slice(0, 200) });
    }
  }
}
const noAccess = await page('/admin/no-access', other);
ok(noAccess.status === 200 && noAccess.body.includes('You don&#x27;t have access to this page.'), 'the no-access page says so');

const ACTIONS = [
  ['deskCreateTarget', { name: `${MARK} Intruder`, category: 'other' }],
  ['deskUpdateTarget', { target: T1, name: `${MARK} Renamed` }],
  ['deskSetStage', { target: T1, stage: 'declined' }],
  ['deskSetFlags', { target: T1, op: 'opt_out' }],
  ['deskDeleteTarget', { target: T1, confirm: 'delete' }],
  ['deskSaveContact', { target: T1, name: `${MARK} Intruder` }],
  ['deskDeleteContact', { target: T2, contact: guess, confirm: 'delete' }],
  ['deskLogTouch', { target: T1, channel: 'call', kind: 'conversation' }],
  ['deskDeleteTouch', { target: T1, touch: first.id, confirm: 'delete' }],
  ['deskLogOutcome', { target: T1, kind: 'reply' }],
  ['deskAddNote', { target: T1, body: `${MARK} intruder` }],
  ['deskAddAction', { target: T1, title: `${MARK} intruder` }],
  ['deskSetAction', { action: act.id, op: 'reopen' }],
  ['deskFollowup', { followup: f4, op: 'resume' }],
  ['deskRateOutcome', { outcome: sql1(`select id from outreach_outcomes limit 1`).id, sentiment: 'negative' }],
];
const snapshot = () => JSON.stringify([
  counts(),
  sql(`select id, name, stage, opted_out from outreach_targets order by id`),
  sql(`select id, status from outreach_actions order by id`),
  sql(`select id, sentiment from outreach_outcomes order by id`),
  sql(`select id, status, snoozed_until from outreach_followups order by id`),
  sql(`select id, name, email from outreach_contacts order by id`),
]);
const was = snapshot();
for (const [name, fields] of ACTIONS) {
  for (const [label, sess, where] of WHO) {
    const res = await action(DESK(name), [fd(fields)], sess).catch((e) => ({ error: String(e) }));
    ok(res.redirect && new URL(res.redirect, BASE).pathname === where, `${name}, ${label}: refused (to ${where})`, res);
  }
}
const importArg = fileArg({}, { file: { name: 'x.json', type: 'application/json', base64: Buffer.from('{}').toString('base64') } });
for (const [label, sess, where] of WHO) {
  const res = await action(DESK('deskImport'), [importArg], sess).catch((e) => ({ error: String(e) }));
  ok(res.redirect && new URL(res.redirect, BASE).pathname === where, `deskImport, ${label}: refused`, res);
}
eq(snapshot(), was, 'every refused action changed nothing');

// REST: nobody but the service role reads a row
for (const table of ['outreach_targets', 'outreach_contacts', 'outreach_touches', 'outreach_touch_recipients', 'outreach_outcomes', 'outreach_followups', 'outreach_notes', 'outreach_actions', 'outreach_stage_history']) {
  for (const [label, sess] of [['anon', null], ['a member', memberSess], ['another admin', other], ['the owner\u2019s own session', owner]]) {
    const res = await rest('GET', `${table}?select=*&limit=1`, sess);
    ok(res.status !== 200 || (Array.isArray(res.json) && res.json.length === 0), `REST ${table}, ${label}: nothing`, res);
  }
}
const self = await rest('PATCH', `admin_users?id=eq.${otherSaved.userId}`, other, { is_owner: true });
eq(sql1(`select is_owner from admin_users where id = ${q(otherSaved.userId)}`).is_owner, false, 'another admin can\u2019t make themselves the owner through REST', self);
let twoOwners = null;
try { exec(`update admin_users set is_owner = true where id = ${q(otherSaved.userId)}`); twoOwners = 'allowed'; } catch { twoOwners = 'refused'; }
eq(twoOwners, 'refused', 'the database allows at most one owner');

// ============================================================================================ the import
const fileJson = {
  format: 'club-yuppie-desk-import', version: 1,
  targets: [{
    key: `${MARK}-imp`, name: `${MARK} Imported`, category: 'restaurant', stage: 'call_booked', next_call_at: '2026-11-20T12:00:00Z',
    contacts: [{ key: `${MARK}-c1`, name: `${MARK} Founder`, mailbox_type: 'founder', email: `${MARK.toLowerCase()}@example-imp.test`, email_source: 'their_reply' }],
    touches: [{ key: `${MARK}-l1`, sequence: `${MARK}-l1`, channel: 'letter', kind: 'first', letter_posted_on: '2026-11-09', to: [`${MARK}-c1`] }],
    outcomes: [{ key: `${MARK}-r1`, touch: `${MARK}-l1`, contact: `${MARK}-c1`, kind: 'reply', sentiment: 'positive', received_at: '2026-11-12T22:18:00Z', summary: 'Asked for a call' }],
    notes_list: [{ key: `${MARK}-n1`, kind: 'note', happened_at: '2026-11-13T09:00:00Z', body: 'From the log' }],
    actions: [{ key: `${MARK}-a1`, kind: 'call', title: 'The call', starts_at: '2026-11-20T12:00:00Z' }],
  }],
};
const imp = fileArg({}, { file: { name: 'import.json', type: 'application/json', base64: Buffer.from(JSON.stringify(fileJson)).toString('base64') } });
r = await action(DESK('deskImport'), [imp], owner);
ok(r.redirect?.endsWith('?done=imported'), 'Import: done', r);
const IMP = sql1(`select id, stage, next_call_at from outreach_targets where import_key = ${q(`${MARK}-imp`)}`);
eq({ stage: IMP.stage, call: IMP.next_call_at }, { stage: 'call_booked', call: '2026-11-20T12:00:00+00:00' }, 'imported with its stage and next call');
eq(sql1(`select status, reason from outreach_followups where target_id = ${q(IMP.id)}`), { status: 'cancelled', reason: 'replied' }, 'the history is replayed: the letter\u2019s follow-up was scheduled, then the reply stopped it');
eq(sql1(`select is_first_reply, reply_seconds from outreach_outcomes where target_id = ${q(IMP.id)}`).is_first_reply, true, 'its reply is the first');
const beforeAgain = counts();
r = await action(DESK('deskImport'), [imp], owner);
eq(counts(), beforeAgain, 'a second import of the same file changes nothing');
ok(r.redirect?.endsWith('?done=import_nothing_new'), 'and says so ("Nothing new")', r);
// several partners go in a few at a time (16 Nov: the live import was slow); each keeps its own history and dates
const many = {
  format: 'club-yuppie-desk-import', version: 1,
  targets: Array.from({ length: 6 }, (_, i) => ({
    key: `${MARK}-m${i}`, name: `${MARK} Many ${i}`, category: 'bar', stage: 'contacted',
    contacts: [{ key: `${MARK}-m${i}-c`, name: `${MARK} Manager ${i}`, mailbox_type: 'named_person', email: `${MARK.toLowerCase()}.m${i}@example-many.test`, email_source: 'published' }, { key: `${MARK}-m${i}-c2`, name: `${MARK} Owner ${i}`, mailbox_type: 'founder', email: `${MARK.toLowerCase()}.o${i}@example-many.test`, email_source: 'published' }],
    touches: [{ key: `${MARK}-m${i}-e`, sequence: `${MARK}-m${i}-e`, channel: 'email', kind: 'first', sent_at: `2026-11-1${i % 3}T09:00:00Z`, to: [`${MARK}-m${i}-c`], cc: [`${MARK}-m${i}-c2`] }],
    outcomes: [], notes_list: [{ key: `${MARK}-m${i}-n`, kind: 'note', happened_at: '2026-11-13T09:00:00Z', body: 'A' }, { key: `${MARK}-m${i}-n2`, kind: 'note', happened_at: '2026-11-13T10:00:00Z', body: 'B' }],
    actions: [{ key: `${MARK}-m${i}-a`, kind: 'task', title: 'One', due_on: '2026-11-20' }, { key: `${MARK}-m${i}-a2`, kind: 'task', title: 'Two', due_on: '2026-11-21' }],
  })),
};
const beforeMany = counts();
r = await action(DESK('deskImport'), [fileArg({}, { file: { name: 'many.json', type: 'application/json', base64: Buffer.from(JSON.stringify(many)).toString('base64') } })], owner);
ok(r.redirect?.endsWith('?done=imported'), 'Import of six partners: done', r);
const afterMany = counts();
eq({ t: afterMany.tg - beforeMany.tg, c: afterMany.c - beforeMany.c, x: afterMany.x - beforeMany.x, f: afterMany.f - beforeMany.f, n: afterMany.n - beforeMany.n, a: afterMany.a - beforeMany.a },
  { t: 6, c: 12, x: 6, f: 6, n: 12, a: 12 }, 'all six, each with its two contacts, its email, its follow-up, two notes and two action points');
eq(sql(`select t.import_key k, f.due_on::text d, t.stage s, (select count(*) from outreach_touch_recipients r join outreach_touches x on x.id = r.touch_id where x.target_id = t.id)::int r
  from outreach_targets t join outreach_followups f on f.target_id = t.id where t.import_key like ${q(`${MARK}-m%`)} order by t.import_key`).map((x) => `${x.k.slice(-2)} ${x.d} ${x.s} ${x.r}`),
  ['m0 2026-11-19 contacted 2', 'm1 2026-11-20 contacted 2', 'm2 2026-11-23 contacted 2', 'm3 2026-11-19 contacted 2', 'm4 2026-11-20 contacted 2', 'm5 2026-11-23 contacted 2'],
  'each follow-up 7 working days after its own email (10th to 19th, 11th to 20th, 12th to 23rd), to and cc kept');
const beforeBad = counts();
const bad = fileArg({}, { file: { name: 'bad.json', type: 'application/json', base64: Buffer.from(JSON.stringify({ format: 'club-yuppie-desk-import', version: 1, targets: [{ key: 'x', name: 'X', category: 'pubs' }] })).toString('base64') } });
r = await action(DESK('deskImport'), [bad], owner);
ok(r.redirect?.endsWith('?error=bad_file') && JSON.stringify(counts()) === JSON.stringify(beforeBad), 'a file with a wrong value is refused whole');

// ============================================================================================ the audit trail
const auditRows = sql(`select action, details::text as d, target_type from admin_audit where action like 'desk.%' and created_at > now() - interval '30 minutes'`);
ok(auditRows.length >= 20, `every desk action is audited (${auditRows.length} rows)`);
ok(auditRows.every((a) => !a.d.includes(MARK) && !a.d.toLowerCase().includes(MARK.toLowerCase()) && !/@/.test(a.d)), 'audit rows hold ids and counts, never a name, an address or words');

// ============================================================================================ delete a partner
r = await run('deskDeleteTarget', { target: T1, confirm: 'delete' });
ok(r.redirect === '/admin/desk?done=deleted', 'Delete partner: done');
eq(sql1(`select (select count(*) from outreach_touches where target_id = ${q(T1)})::int + (select count(*) from outreach_outcomes where target_id = ${q(T1)})::int + (select count(*) from outreach_notes where target_id = ${q(T1)})::int + (select count(*) from outreach_followups where target_id = ${q(T1)})::int n`).n, 0, 'everything about them is gone');

// tidy up this run's partners
exec(`delete from outreach_targets where name like ${q(`${MARK}%`)} or import_key like ${q(`${MARK}%`)}`);
done();
