// Stage 2 checks for lib/emails, with no server and no browser:
//   node tests/e2e/phase-b/emails/check-emails-b.mjs
//
// The library check (tests/e2e/phase-a/emails/check-emails.mjs) covers every
// email and text for holes, the design byte for byte, escaping, absolute
// links, the copy audit and the text-part structure. This one checks what is
// new in stage 2, state by state:
//  1. plan changed: time, place, both; free wording only;
//  2. plan cancelled: free wording, no money, the generalised serif line;
//  3. plan reminder: 24h and 2h words (round 3), the going-too words, nobody else;
//  4. the chat nudge: never the message or the sender (by its data shape), the three chat kinds;
//  5. photo removed: the three reasons, word for word;
//  6. admin new report: the drawn states, the plan report, nothing reported in the email;
//  7. the texts: the table's words and counts, the 40/30 cut with no ellipsis, the worst case in one text, typed
//     punctuation kept standard, the Unicode flag, quiet hours wording, the site setting;
//  8. default links and the footer switch link (Choose what we email you, Turn these emails off).
// Exit code 1 on any failure.
import { loadEmails } from '../../phase-a/emails/load-emails.mjs';

let passed = 0;
const failures = [];
function check(ok, what) {
  if (ok) passed++;
  else failures.push(what);
}

delete process.env.NEXT_PUBLIC_SITE_URL;
delete process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS;
const emails = await loadEmails();
const { EMAIL_FIXTURES, TEXT_FIXTURES } = await loadEmails('fixtures.ts');
const fx = (name, id) => EMAIL_FIXTURES[name].find((f) => f.id === id).data;
const tfx = (name, id) => TEXT_FIXTURES[name].find((f) => f.id === id).data;
const render = (name, data, opts = {}) => emails.renderEmailWith(name, data, { site: 'https://clubyuppie.com', ...opts });
const MONEY = /£|refund|paid|pay\b|card|charge/i;

for (const n of ['plan-changed', 'plan-cancelled', 'plan-reminder', 'new-message', 'photo-removed', 'admin-new-report']) {
  check(emails.EMAIL_NAMES.includes(n), `${n}: is an email`);
}
for (const n of ['reminders-on', 'event-reminder', 'plan-reminder']) check(emails.TEXT_NAMES.includes(n), `${n}: is a text`);
check(emails.EMAIL_AUDIENCE['admin-new-report'] === 'admin' && emails.EMAIL_AUDIENCE['new-message'] === 'member', 'audiences');

// ---------------------------------------------------------------- 1. plan changed
{
  const t = render('plan-changed', fx('plan-changed', 'design'));
  check(t.subject === 'Date or place changed: Sunday walk and coffee', 'plan-changed: subject');
  check(t.text.includes('Priya changed the time for Sunday walk and coffee.\n') && t.preheader === 'Priya moved it to 11:30. You’re still in.', 'plan-changed time: intro and preheader');
  const p = render('plan-changed', fx('plan-changed', 'place'));
  check(p.text.includes('Priya changed the place for Sunday walk and coffee.\n'), 'plan-changed place: intro');
  check(p.preheader === 'Priya moved it to Riverside Gardens, south gate. You’re still in.', `plan-changed place: preheader ${p.preheader}`);
  check(p.text.includes('Plan: Sunday walk and coffee\nWhen: Sun 25 Oct, 11:00\nWas: Calder Park\nWhere: Riverside Gardens, south gate\nMap: '), 'plan-changed place: rows');
  const b = render('plan-changed', fx('plan-changed', 'both'));
  check(b.text.includes('Priya changed the time and place for Sunday walk and coffee.\n'), 'plan-changed both: intro');
  check(b.preheader === 'Priya moved it to Mon 26 Oct, 18:00 at Riverside Gardens, south gate. You’re still in.', `plan-changed both: preheader ${b.preheader}`);
  check(b.text.includes('Was: Sun 25 Oct, 11:00\nNow: Mon 26 Oct, 18:00\nWas: Calder Park\nWhere: Riverside Gardens, south gate\n'), 'plan-changed both: rows');
  for (const r of [t, p, b]) check(!MONEY.test(r.text), 'plan-changed: no money words (free plans only)');
}

// ---------------------------------------------------------------- 2. plan cancelled
{
  const r = render('plan-cancelled', fx('plan-cancelled', 'design'));
  check(r.subject === 'Cancelled: Sunday walk and coffee' && r.preheader === 'Priya cancelled it. Nothing to pay and nothing to do.', 'plan-cancelled: subject and preheader');
  check(r.text.startsWith('Priya cancelled. The plan’s off.\n\nPriya cancelled Sunday walk and coffee on Sun 25 Oct, 11:00. Nothing to pay and nothing to do.\n'), 'plan-cancelled: headline (generalised) and intro');
  check(r.html.includes('href="https://clubyuppie.com/members/open-invite"'), 'plan-cancelled: See Open Invite goes to the route');
  check(!/£|refund|card/i.test(r.text), 'plan-cancelled: free wording only');
  check(r.text.includes('You’re getting this because you were in an Open Invite plan on Club Yuppie.'), 'plan-cancelled: footer');
}

// ---------------------------------------------------------------- 3. plan reminder
{
  const d = render('plan-reminder', fx('plan-reminder', 'design'));
  check(d.subject === 'Tomorrow, 10:00: Saturday morning class + brunch', 'plan-reminder 24h: subject');
  const two = render('plan-reminder', fx('plan-reminder', '2h'));
  check(two.subject === 'In 2 hours, 10:00: Saturday morning class + brunch', 'plan-reminder 2h: subject (round 3 board)');
  check(two.text.startsWith('In 2 hours. See you there.\n\nSaturday morning class + brunch starts at 10:00. Jasmin and Priya are going too.\n'), 'plan-reminder 2h: headline and first line (round 3 board)');
  const one = render('plan-reminder', fx('plan-reminder', 'one-other'));
  check(one.text.includes('You’re in Saturday morning class + brunch. Jasmin is going too.\n') && one.text.includes('Going: Jasmin and you\n'), 'plan-reminder: one other');
  const many = render('plan-reminder', fx('plan-reminder', 'many'));
  check(many.text.includes('Jasmin, Priya and 4 others are going too.') && many.text.includes('Going: Jasmin, Priya, Tom, Ollie, Chloe, Dan and you\n'), 'plan-reminder: many others');
  const alone = render('plan-reminder', fx('plan-reminder', 'alone'));
  check(alone.preheader === 'Psycle, Oxford Circus.' && !alone.text.includes('Going:') && !alone.text.includes('going too'), 'plan-reminder: nobody else going');
  check(!MONEY.test(d.text), 'plan-reminder: no money words');
}

// ---------------------------------------------------------------- 4. the chat nudge
{
  // The data shape has no field for the message or the sender (messages decision 1 A).
  for (const f of EMAIL_FIXTURES['new-message']) {
    for (const k of Object.keys(f.data)) check(['kind', 'plan', 'place', 'newCount', 'chatUrl'].includes(k), `new-message/${f.id}: unexpected field ${k}`);
  }
  // A message and a sender put next to the data never reach the email.
  const leaky = { ...fx('new-message', 'design'), text: 'Easier if you just send me the money', sender: 'Ollie', from: 'Ollie' };
  const r = render('new-message', leaky);
  check(!/Ollie|send me the money/.test(r.html + r.text + r.subject + r.preheader), 'new-message: no message text or sender');
  check(r.subject === 'New message in Saturday morning class + brunch', 'new-message: subject names the chat only');
  const one = render('new-message', fx('new-message', 'one'));
  check(one.text.includes('There’s 1 new message in Saturday morning class + brunch. Log in to read it and reply.\n') && one.text.includes('New: 1 message\n'), 'new-message: one');
  const q = render('new-message', fx('new-message', 'question'));
  check(q.subject === 'New question about Climbing and a pint' && q.text.includes('Chat: About Climbing and a pint\n'), 'new-message question: subject (push body) and chat');
  const a = render('new-message', fx('new-message', 'reply'));
  check(a.subject === 'New reply about Climbing and a pint' && a.text.startsWith('You’ve got a reply. Over to you.\n'), 'new-message reply: subject and headline');
  check(a.html.includes('href="https://clubyuppie.com/members/messages/chat-climb-ask"'), 'new-message reply: thread link');
  check(r.html.includes('href="https://clubyuppie.com/members/messages"'), 'new-message: default link is the inbox (as drawn)');
  check(r.text.includes('You’re getting this because you’re in a chat on Club Yuppie. We send at most one of these an hour for each chat.\nQuestions?'), 'new-message: footer, switch link hidden while Notifications is off');
  const on = render('new-message', fx('new-message', 'design'), { notificationsLink: true });
  check(on.text.includes('for each chat.\nTurn these emails off: https://clubyuppie.com/members/you/notifications\nQuestions?'), 'new-message: Turn these emails off on its own text line');
  check(on.html.includes('>Turn these emails off</a>.') && !on.html.includes('Choose what we email you'), 'new-message: Turn these emails off in the html');
}

// ---------------------------------------------------------------- 5. photo removed
{
  const want = {
    'design': 'We removed your photo because it wasn’t a clear photo of you.',
    'not-member': 'We removed your photo because it wasn’t a photo of the member.',
    'not-suitable': 'We removed your photo because it wasn’t suitable for the club.',
  };
  for (const [id, line] of Object.entries(want)) {
    const r = render('photo-removed', fx('photo-removed', id));
    check(r.text.includes(`\n\n${line}\n\n`) && r.html.includes(line.replace('’', '’')), `photo-removed/${id}: ${line}`);
    check(r.subject === 'We removed your photo' && r.html.includes('href="https://clubyuppie.com/members"'), `photo-removed/${id}: subject and button`);
  }
  check(Object.keys(emails.PHOTO_REMOVED_REASONS).join() === 'not_clear,not_member,not_suitable', 'photo-removed: the three reason ids');
}

// ---------------------------------------------------------------- 6. admin new report
{
  const base = { reason: 'Pressure to pay outside the app', about: 'Ollie', by: 'Sam', sent: { date: 'Sun 25 Oct', time: '09:41' }, open: 2 };
  const member = render('admin-new-report', { ...base, kind: 'member' });
  check(member.text.includes('\n\nSam reported Ollie.\n\nType: Member\n'), 'admin-new-report member: drawn first sentence and Type');
  const photo = render('admin-new-report', { ...base, kind: 'photo' });
  check(photo.text.includes('\n\nSam reported a photo of Ollie.\n\nType: Photo\n'), 'admin-new-report photo: drawn first sentence and Type');
  const msg = render('admin-new-report', { ...base, kind: 'message', planTitle: 'Saturday morning class + brunch' });
  check(msg.text.includes('The message isn’t in this email on purpose.'), 'admin-new-report message: small print');
  for (const r of [member, photo]) check(!r.text.includes('The message isn’t'), 'admin-new-report: no message small print without a message');
  const plan = render('admin-new-report', fx('admin-new-report', 'plan'));
  check(plan.text.includes('\n\nPriya reported a plan: Comedy night, two spare tickets.\n\nType: Plan\n') && plan.subject === 'New report: Not a real plan', 'admin-new-report plan');
  const first = render('admin-new-report', fx('admin-new-report', 'photo'));
  check(first.text.includes('Open: 1 report\n'), 'admin-new-report: one report');
  for (const f of EMAIL_FIXTURES['admin-new-report']) {
    for (const k of Object.keys(f.data)) check(['kind', 'reason', 'about', 'by', 'planTitle', 'sent', 'open', 'reportUrl'].includes(k), `admin-new-report/${f.id}: unexpected field ${k} (nothing reported goes in the email)`);
  }
  check(member.html.includes('href="https://clubyuppie.com/admin/reports"'), 'admin-new-report: Open the report link');
}

// ---------------------------------------------------------------- 7. texts
{
  const T = (name, data) => emails.renderText(name, data);
  // The cut: plan title at 40, place at 30, no ellipsis, nothing dangling.
  const longest = T('plan-reminder', tfx('plan-reminder', 'longest'));
  check(longest === 'Club Yuppie: Sunday long run along the canal, then a starts in 2 hours, 08:00, The bandstand by the north gat. See the plan: clubyuppie.com/members', `text longest: ${longest}`);
  check(!/…/.test(longest), 'text: no ellipsis character');
  // The worst case in both windows: one standard text (notifications 3.7 says 144 for the 24-hour one).
  for (const w of ['24h', '2h']) {
    const worst = T('plan-reminder', { window: w, title: 'A'.repeat(60), time: '10:00', place: 'B'.repeat(45) });
    const c = emails.smsCount(worst);
    check(worst.includes('A'.repeat(40) + ' ') && !worst.includes('A'.repeat(41)) && worst.includes(', ' + 'B'.repeat(30) + '.') && !worst.includes('B'.repeat(31)), `text worst ${w}: cut at 40 and 30`);
    check(c.encoding === 'Standard' && c.parts === 1 && c.characters === (w === '24h' ? 144 : 148), `text worst ${w}: ${JSON.stringify(c)}`);
  }
  check(emails.PLAN_TITLE_MAX === 40 && emails.PLAN_PLACE_MAX === 30, 'text: cut constants');
  // Club event titles are the club's: not cut.
  const ev = T('event-reminder', { window: '24h', title: 'Summer garden party with live jazz and oysters', time: '14:00', place: 'The Old Botanical Glasshouse' });
  check(ev.includes('Summer garden party with live jazz and oysters is tomorrow at 14:00, The Old Botanical Glasshouse.'), 'text: event titles are not cut');
  // Typed punctuation stays standard; a letter outside the alphabet is flagged Unicode.
  const typed = T('plan-reminder', tfx('plan-reminder', 'typed-apostrophe'));
  check(typed.startsWith("Club Yuppie: Sam's birthday drinks - rooftop is tomorrow at 19:00,") && emails.smsCount(typed).encoding === 'Standard' && emails.smsCount(typed).parts === 1, `text typed apostrophe: ${typed}`);
  const uni = emails.renderTextCounted('plan-reminder', tfx('plan-reminder', 'unicode'));
  check(uni.count.encoding === 'Unicode' && uni.count.limit === 70 && uni.count.parts === 2 && uni.body.includes('Zoë'), `text unicode flag: ${JSON.stringify(uni.count)}`);
  check(emails.smsCount('Club Yuppie: Padel & Pints is tomorrow at 18:30, Northgate Courts. Don’t forget your racket. See your booking: clubyuppie.com/members').characters === 133, 'text: the round 3 trap is 133 Unicode');
  check(emails.smsCount('Club Yuppie: Padel & Pints is tomorrow at 18:30, Northgate Courts. Don’t forget your racket. See your booking: clubyuppie.com/members').parts === 2, 'text: the round 3 trap is 2 texts');
  // One line, no stray spaces.
  const messy = T('plan-reminder', { window: '24h', title: '  Drinks\n\nat the  pub ', time: '19:00', place: 'The Crown,\n' });
  check(messy === 'Club Yuppie: Drinks at the pub is tomorrow at 19:00, The Crown. See the plan: clubyuppie.com/members', `text messy: ${messy}`);
  // Quiet hours: held to the day itself.
  check(T('event-reminder', tfx('event-reminder', 'held-today')) === 'Club Yuppie: Padel & Pints is today at 08:30, Northgate Courts. See your booking: clubyuppie.com/members', 'text held today');
  check(T('plan-reminder', { window: '24h', title: 'Run', time: '06:30', place: 'Calder Park', day: 'tomorrow' }).includes('Run is tomorrow at 06:30, Calder Park.'), 'text held tomorrow');
  // The reminders-on link is the Notifications page's route, one standard text.
  const on = T('reminders-on', {});
  check(on === 'Club Yuppie: reminders by text are on. Turn them off any time at clubyuppie.com/members/you/notifications', `text reminders-on: ${on}`);
  check(emails.smsCount(on).parts === 1 && emails.smsCount(on).characters === 105, 'text reminders-on: 105, one text');
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3101/';
  check(T('event-reminder', tfx('event-reminder', 'design')).endsWith('See your booking: localhost:3101/members') && T('reminders-on', {}).endsWith('localhost:3101/members/you/notifications'), 'texts follow NEXT_PUBLIC_SITE_URL');
  delete process.env.NEXT_PUBLIC_SITE_URL;
  // Every fixture is one text except the Unicode example.
  for (const name of emails.TEXT_NAMES) {
    for (const f of TEXT_FIXTURES[name]) {
      const c = emails.renderTextCounted(name, f.data).count;
      if (f.id === 'unicode') continue;
      check(c.parts === 1, `text ${name}/${f.id}: ${JSON.stringify(c)}`);
      if (name !== 'welcome') check(c.encoding === 'Standard', `text ${name}/${f.id}: standard alphabet`);
    }
  }
}

// ---------------------------------------------------------------- 8. switch links
{
  for (const n of ['plan-changed', 'plan-cancelled', 'plan-reminder']) {
    const off = render(n, EMAIL_FIXTURES[n][0].data);
    check(!off.html.includes('Choose what we email you'), `${n}: switch link hidden while the Notifications page is off`);
    process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS = 'on';
    const on = emails.renderEmail(n, EMAIL_FIXTURES[n][0].data);
    delete process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS;
    check(on.html.includes('href="https://clubyuppie.com/members/you/notifications" class="keep" style="color:#1B1512;font-weight:700;text-decoration:underline;">Choose what we email you</a>.'), `${n}: Choose what we email you when the page is on`);
  }
  for (const n of ['photo-removed', 'admin-new-report']) {
    const on = render(n, EMAIL_FIXTURES[n][0].data, { notificationsLink: true });
    check(!on.html.includes('/notifications'), `${n}: no switch link (account and admin emails always go)`);
  }
}

console.log(`stage 2 emails and texts: ${passed} checks passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL ' + f);
if (failures.length) process.exitCode = 1;
