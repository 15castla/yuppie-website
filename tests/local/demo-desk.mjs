// Made-up partners for trying the Outreach Desk on the local test copy (tests/local/README.md): two people on the
// desk (bf. as Albert, AC, the owner; dk. as Kira, KW), and six invented businesses at different stages, with emails,
// a bounce and a resend, replies, a meeting booked with the emails that arranged it, a meeting held with notes and
// action points, a letter, and follow-ups due. Nothing here is real: every name, address and word is invented.
// Re-runnable: it replaces its own partners each time. Run inside the container, with the site up:
//   node /home/claude/co/tests/local/demo-desk.mjs
import fs from 'node:fs';
import { action, adminSession, exec, fd, q, sql1 } from '../e2e/phase-b/lib.mjs';

const albertId = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-bf.json', 'utf8')).userId;
const kiraId = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-dk.json', 'utf8')).userId;
const NAMES = ['Copper Fern Cafe', 'Brass Lantern', 'Juniper Row', 'Linden Club', 'Harbour and Pine', 'Marlowe Barbers'];
exec(`update admin_users set is_owner = false where is_owner;
  update admin_users set initials = null where initials in ('AC', 'KW') and id not in (${q(albertId)}, ${q(kiraId)});
  update admin_users set is_owner = true, desk_access = true, initials = 'AC', full_name = 'Albert Castle' where id = ${q(albertId)};
  update admin_users set desk_access = true, initials = 'KW', full_name = 'Kira Woodd' where id = ${q(kiraId)};
  delete from outreach_targets where name in (${NAMES.map(q).join(', ')});`);
const albert = await adminSession('bf.');
const kira = await adminSession('dk.');
const run = (who) => async (name, fields) => {
  const r = await action(`admin.desk.${name}`, [fd(fields)], who);
  if (r.redirect?.includes('error=')) throw new Error(`${name}: ${r.redirect}`);
  return r;
};
const A = run(albert);
const K = run(kira);
const idOf = (r) => /\/admin\/desk\/t\/([0-9a-f-]{36})/.exec(r.redirect ?? '')?.[1];
const contact = (t) => sql1(`select id from outreach_contacts where target_id = ${q(t)} order by created_at limit 1`).id;
const seq = (t) => sql1(`select sequence_id from outreach_touches where target_id = ${q(t)} and kind = 'first'`).sequence_id;
// a UK date and time a number of days from today, as a form's datetime-local holds it
const day = (n, hh = 10, mm = 0) => {
  const d = new Date(Date.now() + n * 86400_000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
  return `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const ymd = (n) => day(n).slice(0, 10);

// 1. Copper Fern Cafe (Kira's): a first email last week, the follow-up due today
let r = await K('deskCreateTarget', { name: NAMES[0], category: 'cafe', stage: 'researching', ask: 'discount', ask_line: 'a members’ discount at Copper Fern', contact_name: 'Ivy Moss', contact_role: 'Owner', contact_email: 'ivy@copperfern.example', contact_source: 'published' });
const fern = idOf(r);
await K('deskLogTouch', { target: fern, channel: 'email', kind: 'first', sent_at: day(-7, 9, 15), to: contact(fern), subject: 'Yuppie and Copper Fern', body_text: 'Hi Ivy,\n\nI look after partners at Yuppie, a social club with an app...\n\nBest,\nKira' });
exec(`update outreach_followups set due_on = ${q(ymd(0))} where target_id = ${q(fern)}`);

// 2. Brass Lantern (Albert's): a bounce and a resend, a reply, the emails arranging a meeting, the meeting booked
r = await A('deskCreateTarget', { name: NAMES[1], category: 'bar', stage: 'researching', ask: 'events', ask_line: 'hosting a members’ night', contact_name: 'Tom Hale', contact_role: 'General manager', contact_email: 'tom.hale@brasslantern.example', contact_source: 'apollo' });
const brass = idOf(r);
const tom = contact(brass);
await A('deskLogTouch', { target: brass, channel: 'email', kind: 'first', sent_at: day(-12, 9, 40), to: tom, new_email: 'events@brasslantern.example', new_mailbox_type: 'group_mailbox', new_source: 'guessed', subject: 'A members’ night at Brass Lantern', body_text: 'Hi Tom,\n\nWould you host a members’ night for Yuppie...\n\nBest,\nAlbert' });
await A('deskLogOutcome', { target: brass, kind: 'bounce', channel: 'email', received_at: day(-12, 9, 41), bounced_address: 'events@brasslantern.example', bounce_code: '5.1.1' });
await A('deskLogOutcome', { target: brass, kind: 'reply', channel: 'email', from_contact: tom, received_at: day(-10, 14, 5), sentiment: 'positive', body_text: 'Hi Albert,\n\nSounds good. Could we meet to talk it through?\n\nTom' });
await A('deskLogTouch', { target: brass, channel: 'email', kind: 'conversation', sequence: seq(brass), sent_at: day(-9, 8, 50), to: tom, body_text: 'Hi Tom,\n\nGreat. Would next Thursday at 10:00 work, at the bar?\n\nBest,\nAlbert' });
await A('deskLogOutcome', { target: brass, kind: 'reply', channel: 'email', from_contact: tom, received_at: day(-9, 11, 30), body_text: 'Thursday at 10 is fine. See you then.\n\nTom' });
await A('deskBookMeeting', { target: brass, kind: 'meeting', starts_at: day(3, 10, 0), title: 'At the bar, with Tom' });
await A('deskAddNote', { target: brass, kind: 'note', title: 'Before the meeting', body: 'They have a private room for 40. Ask about Thursdays.' });

// 3. Juniper Row (Albert's): agreed after a meeting, with its notes and action points
r = await A('deskCreateTarget', { name: NAMES[2], category: 'restaurant', stage: 'researching', ask: 'discount', ask_line: 'a members’ discount', contact_name: 'Sara Lind', contact_role: 'Owner', contact_email: 'sara@juniperrow.example', contact_source: 'published' });
const juniper = idOf(r);
const sara = contact(juniper);
await A('deskLogTouch', { target: juniper, channel: 'email', kind: 'first', sent_at: day(-20, 10, 0), to: sara, subject: 'Yuppie and Juniper Row' });
await A('deskLogOutcome', { target: juniper, kind: 'reply', channel: 'email', from_contact: sara, received_at: day(-18, 16, 20), sentiment: 'positive', body_text: 'Happy to talk. Come by for a coffee.' });
await A('deskLogTouch', { target: juniper, channel: 'email', kind: 'conversation', sequence: seq(juniper), sent_at: day(-17, 9, 0), to: sara, body_text: 'Lovely. Would Tuesday at 15:00 suit?' });
await A('deskLogOutcome', { target: juniper, kind: 'reply', channel: 'email', from_contact: sara, received_at: day(-17, 12, 0), body_text: 'Tuesday works.' });
await A('deskBookMeeting', { target: juniper, kind: 'meeting', starts_at: day(-14, 15, 0), title: 'Coffee at the restaurant', notes: 'Sara will give members 15% off food, Sunday to Thursday. She wants a mention in the app and a members’ supper in the spring.' });
const met = sql1(`select id from outreach_actions where target_id = ${q(juniper)} and kind = 'meeting'`).id;
await A('deskAddAction', { target: juniper, meeting: met, kind: 'task', title: 'Send Sara the partner page draft', due_on: ymd(2) });
await A('deskAddAction', { target: juniper, meeting: met, kind: 'task', title: 'Pencil in a spring supper', due_on: ymd(10) });
await A('deskSetStage', { target: juniper, stage: 'agreed', note: 'Agreed at the coffee' });

// 4. Linden Club (Kira's): live
r = await K('deskCreateTarget', { name: NAMES[3], category: 'fitness', stage: 'researching', ask: 'extend_corporate_offer', contact_name: 'Naomi Hart', contact_email: 'naomi@lindenclub.example', contact_source: 'rocketreach' });
const linden = idOf(r);
await K('deskLogTouch', { target: linden, channel: 'email', kind: 'first', sent_at: day(-30, 9, 0), to: contact(linden), subject: 'Yuppie and Linden Club' });
await K('deskLogOutcome', { target: linden, kind: 'reply', channel: 'email', from_contact: contact(linden), received_at: day(-29, 11, 0), sentiment: 'positive', body_text: 'Yes, we can extend our corporate rate.' });
await K('deskBookMeeting', { target: linden, kind: 'call', starts_at: day(-27, 12, 0), notes: 'Call with Naomi: the corporate rate for members, from the first of the month.' });
await K('deskSetStage', { target: linden, stage: 'live' });

// 5. Harbour and Pine (Albert's): not contacted yet, a prospect
await A('deskCreateTarget', { name: NAMES[4], category: 'hotel', stage: 'researching', ask: 'featured_partner', ask_line: 'a members’ rate on rooms' });

// 6. Marlowe Barbers (Kira's): a letter posted, the follow-up in three days
r = await K('deskCreateTarget', { name: NAMES[5], category: 'grooming', stage: 'ready', ask: 'discount', contact_name: 'Rafe Marlowe', contact_email: 'rafe@marlowebarbers.example', contact_source: 'published' });
const marlowe = idOf(r);
await K('deskLogTouch', { target: marlowe, channel: 'letter', kind: 'first', posted_on: ymd(-7), to: contact(marlowe), note: 'Signed by Kira' });
exec(`update outreach_followups set due_on = ${q(ymd(3))} where target_id = ${q(marlowe)}`);

console.log(`demo desk ready: ${NAMES.length} made-up partners (AC Albert, KW Kira)`);
