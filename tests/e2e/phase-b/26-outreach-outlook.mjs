// The Outreach Desk, Phase 2: the Outlook connection (16 Nov 2026; plan docs/plans/outreach-desk.md sections 3 and 4),
// against the local stack and a production build, with the REAL drafter (tools/outlook-drafter) driven by
// tests/e2e/phase-b/outlook_e2e.py against a stand-in Outlook. Checks:
//   the door: no key, a wrong key, an unlinked key: 401 and nothing written; bad JSON, too big, wrong method; only the
//     owner can link or unlink; the desk keeps only the fingerprint;
//   the first sync matches what the outreach log already put on the desk (the email's exact time and Outlook's ids
//     filled in, no second row), takes a bounce (the address marked; the follow-up waits only when every address
//     bounced), puts a reply by domain only and an email typed by hand in the review list, adds a business the
//     partner-emails skill wrote to once it was sent, and never stores anyone else's mail;
//   the follow-up: words saved on the desk; drafted in the thread on the next sync (to the right people, with the first
//     email's attachment, never sent); Albert sends it: the follow-up done and the January email scheduled; their
//     reply: the January email cancelled and the stage Replied;
//   a second run changes nothing; the review list: confirm a reply to another partner, confirm a send as a
//     conversation, ignore one (it never comes back); the screens; unlinking stops it; audit rows hold no names.
//   node tests/e2e/phase-b/26-outreach-outlook.mjs     (needs: seed.mjs --prefix bf. and dk.; bf. the owner)
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, action, adminSession, cookieFor, done, eq, exec, fd, fileArg, ok, q, rand, sql, sql1 } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = rand();
const MARK = `O${RUN}`;
const m = MARK.toLowerCase();
const DESK = (name) => `admin.desk.${name}`;
const ownerSaved = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-bf.json', 'utf8'));
exec(`update admin_users set is_owner = false where is_owner; update admin_users set is_owner = true where id = ${q(ownerSaved.userId)}`);
const owner = await adminSession('bf.');
const other = await adminSession('dk.');
const run = (name, fields, session = owner) => action(DESK(name), [fd(fields)], session);

const KEY = crypto.randomBytes(32).toString('base64url');
const FP = crypto.createHash('sha256').update(KEY).digest('hex');
const door = (action, { method = 'GET', key = KEY, body } = {}) =>
  fetch(`${BASE}/api/desk/drafter/${action}`, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body });

// ============================================================================================ the door
let r = await door('hello', { key: null });
eq(r.status, 401, 'no key: 401');
r = await action(DESK('deskLinkDrafter'), [fd({ fingerprint: FP })], other);
ok(!sql1(`select id from outreach_drafter_keys where key_hash = ${q(FP)}`), 'another admin can’t link a drafter', r);
r = await run('deskLinkDrafter', { fingerprint: 'not a fingerprint' });
ok(r.redirect?.endsWith('?error=bad_fingerprint'), 'a wrong fingerprint is refused', r);
r = await run('deskLinkDrafter', { fingerprint: FP.toUpperCase().replace(/(.{8})/g, '$1 ') });
ok(r.redirect?.endsWith('?done=linked'), 'Link Outlook with the fingerprint (spaces and capitals forgiven)', r);
eq(sql1(`select count(*)::int n from outreach_drafter_keys where revoked_at is null`).n, 1, 'one active key');
ok(!JSON.stringify(sql(`select * from outreach_drafter_keys`)).includes(KEY), 'the desk keeps only the fingerprint, never the key');
r = await door('hello', { key: crypto.randomBytes(32).toString('base64url') });
eq(r.status, 401, 'a wrong key: 401');
r = await door('hello');
ok(r.status === 200 && (await r.json()).ok, 'the right key: hello');
eq((await door('report')).status, 404, 'GET report: no such action');
eq((await door('plan', { method: 'POST', body: '{}' })).status, 404, 'POST plan: no such action');
eq((await door('report', { method: 'POST', body: 'not json' })).status, 400, 'not JSON: 400');
eq((await door('report', { method: 'POST', body: JSON.stringify({ items: [], pad: 'x'.repeat(300 * 1024) }) })).status, 413, 'over 256 KB: 413');
const runsBefore = sql1(`select count(*)::int n from outreach_sync_runs`).n;
r = await door('report', { method: 'POST', key: 'x'.repeat(43), body: JSON.stringify({ items: [{ type: 'sent' }] }) });
eq([r.status, sql1(`select count(*)::int n from outreach_sync_runs`).n], [401, runsBefore], 'a refused report writes nothing');

// ============================================================================================ the desk before Outlook
const ukDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
const daysAgo = (n) => ukDay(new Date(Date.now() - n * 86400_000));
const dSent = `${daysAgo(14)}T10:00:00.000Z`;
const log = {
  format: 'club-yuppie-desk-import', version: 1,
  targets: [
    { key: `${MARK}-a`, name: `${MARK} Rosa`, category: 'restaurant', stage: 'replied', domains: [`${m}-a.test`],
      contacts: [{ key: `${MARK}-a-c`, name: 'Naomi', mailbox_type: 'named_person', email: `naomi@${m}-a.test`, email_source: 'rocketreach' }],
      touches: [{ key: `${MARK}-a-t`, sequence: `${MARK}-a-t`, channel: 'email', kind: 'first', sent_at: '2026-11-12T12:00:00.000Z', to: [`${MARK}-a-c`], note: 'v4. Exact time to come from Outlook (Phase 2).' }],
      outcomes: [{ key: `${MARK}-a-o`, touch: `${MARK}-a-t`, contact: `${MARK}-a-c`, kind: 'reply', sentiment: 'positive', received_at: '2026-11-13T10:00:00Z', summary: 'Keen' }],
      notes_list: [], actions: [] },
    { key: `${MARK}-b`, name: `${MARK} Nobu`, category: 'restaurant', stage: 'contacted', domains: [`${m}-b.test`],
      contacts: [{ key: `${MARK}-b-e`, mailbox_type: 'group_mailbox', email: `events@${m}-b.test`, email_source: 'published' },
                 { key: `${MARK}-b-j`, name: 'Jason', mailbox_type: 'named_person', email: `jason@${m}-b.test`, email_source: 'albert' }],
      touches: [{ key: `${MARK}-b-t`, sequence: `${MARK}-b-t`, channel: 'email', kind: 'first', sent_at: '2026-11-11T09:00:00Z', to: [`${MARK}-b-e`], cc: [`${MARK}-b-j`] }],
      outcomes: [], notes_list: [], actions: [] },
    { key: `${MARK}-c`, name: `${MARK} Tailors`, category: 'clothing', stage: 'contacted', domains: [`${m}-c.test`],
      contacts: [{ key: `${MARK}-c-o`, name: 'Owner', mailbox_type: 'founder', email: `owner@${m}-c.test`, email_source: 'albert' }],
      touches: [{ key: `${MARK}-c-l`, sequence: `${MARK}-c-l`, channel: 'letter', kind: 'first', letter_posted_on: '2026-11-09', to: [`${MARK}-c-o`] }],
      outcomes: [], notes_list: [], actions: [] },
    { key: `${MARK}-d`, name: `${MARK} Dash`, category: 'fitness', stage: 'contacted', domains: [`${m}-d.test`],
      contacts: [{ key: `${MARK}-d-c`, name: 'Dee', mailbox_type: 'founder', email: `dee@${m}-d.test`, email_source: 'rocketreach' }],
      touches: [{ key: `${MARK}-d-t`, sequence: `${MARK}-d-t`, channel: 'email', kind: 'first', sent_at: dSent, to: [`${MARK}-d-c`] }],
      outcomes: [], notes_list: [], actions: [] },
  ],
};
r = await action(DESK('deskImport'), [fileArg({}, { file: { name: 'log.json', type: 'application/json', base64: Buffer.from(JSON.stringify(log)).toString('base64') } })], owner);
ok(r.redirect?.endsWith('?done=imported'), 'the outreach log imported', r);
const T = Object.fromEntries(sql(`select import_key k, id from outreach_targets where import_key like ${q(`${MARK}-%`)}`).map((x) => [x.k.slice(-1), x.id]));
const fuD = sql1(`select id, status from outreach_followups where target_id = ${q(T.d)} and step = 1`);
eq(fuD.status, 'scheduled', 'Dash’s follow-up is due');
r = await run('deskSaveFollowupText', { followup: fuD.id, back: `/admin/desk/t/${T.d}`, body: `Hi Dee,\n\n${MARK} just following up on my email.\nAny thoughts?\n\nAlbert` });
ok(r.redirect?.endsWith('?done=text'), 'the follow-up’s words saved', r);
eq(sql1(`select status, written_by from outreach_draft_texts where followup_id = ${q(fuD.id)}`), { status: 'written', written_by: 'albert' }, 'kept as written, by Albert');
r = await run('deskSaveFollowupText', { followup: sql1(`select id from outreach_followups where target_id = ${q(T.a)}`).id, body: 'x' });
ok(r.redirect?.includes('error=not_open'), 'no words for a follow-up that a reply stopped', r);

// ============================================================================================ the stand-in Outlook
const PDF = Buffer.from('%PDF-1.4\n% Club Yuppie overview\n').toString('base64');
const now = new Date();
const later = (min) => new Date(now.getTime() + min * 60_000).toISOString().replace(/\.\d+Z$/, 'Z');
const person = (address, name) => ({ emailAddress: { address, ...(name ? { name } : {}) } });
const PENDING_KEY = crypto.createHash('sha256').update(`${MARK}-newco`).digest('hex');
const messages = [
  { folder: 'sentitems', subject: `${MARK} Club Yuppie and Rosa`, toRecipients: [person(`naomi@${m}-a.test`, 'Naomi')], sentDateTime: '2026-11-12T09:40:00Z', conversationId: `${m}-conv-a`,
    internetMessageId: `<${m}-a1@fake>`, bodyText: 'Dear Naomi, the first email', attachments: [{ name: 'Overview.pdf', contentType: 'application/pdf', contentBytes: PDF, size: 30 }] },
  { folder: 'inbox', subject: `RE: ${MARK} Club Yuppie and Rosa`, from: person(`naomi@${m}-a.test`, 'Naomi'), receivedDateTime: '2026-11-13T10:02:00Z', conversationId: `${m}-conv-a`,
    internetMessageId: `<${m}-a2@fake>`, bodyText: 'Love it, let’s talk' },
  { folder: 'sentitems', subject: `${MARK} Club Yuppie and Nobu`, toRecipients: [person(`events@${m}-b.test`)], ccRecipients: [person(`jason@${m}-b.test`)], sentDateTime: '2026-11-11T09:00:00Z',
    conversationId: `${m}-conv-b`, internetMessageId: `<${m}-b1@fake>`, bodyText: 'Dear events team' },
  { folder: 'inbox', subject: `Undeliverable: ${MARK} Club Yuppie and Nobu`, from: person('postmaster@clubyuppie.onmicrosoft.com', 'Microsoft Outlook'), receivedDateTime: '2026-11-11T09:01:00Z',
    conversationId: `${m}-conv-b`, internetMessageId: `<${m}-b2@fake>`, class: 'REPORT.IPM.Note.NDR', bodyText: `Your message to events@${m}-b.test couldn't be delivered. 550 5.1.1 RecipientNotFound` },
  { folder: 'inbox', subject: 'A partnership', from: person(`maria@${m}-b.test`, 'Maria'), receivedDateTime: '2026-11-14T08:00:00Z', conversationId: `${m}-conv-b2`,
    internetMessageId: `<${m}-b3@fake>`, bodyText: 'Hello from Maria, saw your email' },
  { folder: 'sentitems', subject: 'Following my letter', toRecipients: [person(`owner@${m}-c.test`)], sentDateTime: '2026-11-15T11:00:00Z', conversationId: `${m}-conv-c`,
    internetMessageId: `<${m}-c1@fake>`, bodyText: 'Typed by hand' },
  { folder: 'sentitems', subject: `${MARK} Club Yuppie and Dash`, toRecipients: [person(`dee@${m}-d.test`, 'Dee')], sentDateTime: dSent.replace('.000Z', 'Z'), conversationId: `${m}-conv-d`,
    internetMessageId: `<${m}-d1@fake>`, bodyText: 'Dear Dee, the first email', bodyHtml: '<html><body><p>Dear Dee, the first email</p></body></html>',
    attachments: [{ name: 'Overview.pdf', contentType: 'application/pdf', contentBytes: PDF, size: 30 }] },
  { folder: 'sentitems', subject: `${MARK} Club Yuppie and Newco`, toRecipients: [person(`sam@${m}-newco.test`, 'Sam')], sentDateTime: '2026-11-16T08:00:00Z', conversationId: `${m}-conv-n`,
    internetMessageId: `<${m}-n1@fake>`, key: PENDING_KEY, bodyText: 'Dear Sam' },
  { folder: 'sentitems', subject: 'Supper?', toRecipients: [person(`friend.${m}@gmail.com`)], sentDateTime: '2026-11-12T19:00:00Z', internetMessageId: `<${m}-p1@fake>`, bodyText: `${MARK} private words` },
  { folder: 'inbox', subject: 'Your order', from: person(`orders@${m}-shop.test`), receivedDateTime: '2026-11-12T19:05:00Z', internetMessageId: `<${m}-p2@fake>`, bodyText: `${MARK} receipt words` },
];
const pending = [{ key: PENDING_KEY, draftId: 'x', subject: 'x', partner: { name: `${MARK} Newco`, category: 'fitness', domains: [`${m}-newco.test`], contacts: [{ email: `sam@${m}-newco.test`, name: 'Sam', role: 'Founder', mailboxType: 'founder', source: 'rocketreach' }] } }];
function drafter(scenario) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'outlook-e2e-')), 'scenario.json');
  fs.writeFileSync(file, JSON.stringify({ key: KEY, desk: BASE, prefix: `${m}-`, ...scenario }));
  const out = execFileSync('python3', [path.join(HERE, 'outlook_e2e.py'), file], { encoding: 'utf8', timeout: 300_000 });
  return out.trim().split('\n').map((l) => JSON.parse(l));
}

const steps = drafter({
  messages: structuredClone(messages),
  pending,
  steps: [
    // the first sync reads back to 1 Nov (other runs on this desk leave their own "last sync" behind)
    { sync: { args: ['--since', '2026-11-01'] } },
    { sync: {} },
    { send_drafts: { at: later(1) } },
    { sync: {} },
    { add: { folder: 'inbox', subject: `RE: ${MARK} Club Yuppie and Dash`, from: person(`dee@${m}-d.test`, 'Dee'), receivedDateTime: later(2), conversationId: `${m}-conv-d`, internetMessageId: `<${m}-d9@fake>`, bodyText: 'Yes please' } },
    { sync: {} },
  ],
});
eq(steps.filter((s) => s.step === 'sync').map((s) => s.code), [0, 0, 0, 0], 'four syncs, each OK', steps.map((s) => s.out));
ok(steps.every((s) => s.sendCalls.length === 0), 'nothing ever called a send endpoint');
eq(steps.at(-1).pending, 0, 'the partner email the skill wrote is forgotten on the Mac once the desk has it');

// the first sync matched the log's rows instead of adding new ones
const aTouch = sql(`select internet_message_id, sent_at, conversation_id, web_link, note from outreach_touches where target_id = ${q(T.a)}`);
eq(aTouch.length, 1, 'Rosa: still one email (matched, not added)');
eq([aTouch[0].internet_message_id, aTouch[0].sent_at, aTouch[0].conversation_id], [`<${m}-a1@fake>`, '2026-11-12T09:40:00+00:00', `${m}-conv-a`], 'with Outlook’s id, its thread, and the exact time instead of the log’s date');
ok(aTouch[0].web_link?.startsWith('https://outlook.office365.com/'), 'and the link to open it in Outlook');
eq(aTouch[0].note, 'v4.', 'the log\u2019s "Exact time to come from Outlook" note goes, the rest stays');
const aOut = sql(`select internet_message_id, received_at, body_text from outreach_outcomes where target_id = ${q(T.a)}`);
eq([aOut.length, aOut[0].internet_message_id, aOut[0].body_text], [1, `<${m}-a2@fake>`, 'Love it, let’s talk'], 'Rosa’s reply: matched to the log’s, with its full text');
const bTouch = sql1(`select internet_message_id, sent_at from outreach_touches where target_id = ${q(T.b)} and kind = 'first'`);
eq([bTouch.internet_message_id, bTouch.sent_at], [`<${m}-b1@fake>`, '2026-11-11T09:00:00+00:00'], 'Nobu: matched, its exact time kept');
const bounce = sql1(`select kind, bounced_address, bounce_code, confirmed, body_text from outreach_outcomes where target_id = ${q(T.b)} and kind = 'bounce'`);
eq(bounce, { kind: 'bounce', bounced_address: `events@${m}-b.test`, bounce_code: '5.1.1', confirmed: true, body_text: null }, 'Nobu: the bounce, with the address and code, and no text kept');
eq(sql(`select address, delivery from outreach_touch_recipients r join outreach_touches t on t.id = r.touch_id where t.target_id = ${q(T.b)} order by address`).map((x) => `${x.address.split('@')[0]} ${x.delivery}`),
  ['events bounced', 'jason unknown'], 'the bounced address marked, the other not');
eq(sql1(`select status from outreach_followups where target_id = ${q(T.b)} and step = 1`).status, 'scheduled', 'Nobu’s follow-up still waits for its day (Jason didn’t bounce)');
const maria = sql1(`select id, confirmed, match_method, contact_id, from_address from outreach_outcomes where target_id = ${q(T.b)} and kind = 'reply'`);
eq([maria.confirmed, maria.match_method, maria.contact_id], [false, 'domain', null], 'a reply from someone new at Nobu’s domain waits in the review list');
const cSend = sql1(`select id, status, guess_kind from outreach_touches where target_id = ${q(T.c)} and channel = 'email'`);
eq([cSend.status, cSend.guess_kind], ['unconfirmed', 'resend'], 'an email typed by hand to the tailors waits in the review list, guessed a resend');
const newco = sql1(`select id, name, category, stage, domains from outreach_targets where name = ${q(`${MARK} Newco`)}`);
eq([newco?.category, newco?.stage, newco?.domains], ['fitness', 'contacted', [`${m}-newco.test`]], 'the business the skill wrote to is on the desk now it’s been sent, Contacted');
eq(sql1(`select email_source, mailbox_type, role from outreach_contacts where target_id = ${q(newco.id)}`), { email_source: 'rocketreach', mailbox_type: 'founder', role: 'Founder' }, 'with its contact and where the address came from');
eq(sql1(`select kind, status, step from outreach_touches where target_id = ${q(newco.id)}`), { kind: 'first', status: 'sent', step: 0 }, 'its first email');
eq(sql1(`select status from outreach_followups where target_id = ${q(newco.id)}`).status, 'scheduled', 'and its follow-up scheduled');
for (const words of [`friend.${m}@gmail.com`, `orders@${m}-shop.test`, `${MARK} private words`, `${MARK} receipt words`]) {
  const hits = sql1(`select (select count(*) from outreach_touch_recipients where address = ${q(words)})::int + (select count(*) from outreach_outcomes where from_address = ${q(words)} or body_text = ${q(words)})::int
    + (select count(*) from outreach_touches where body_text = ${q(words)})::int + (select count(*) from outreach_contacts where email = ${q(words)})::int n`).n;
  eq(hits, 0, `nothing of anyone else’s mail on the desk (${words.includes('@') ? 'an address' : 'their words'})`);
}

// the follow-up: drafted in the thread on the second sync, sent, then their reply
const drafted = steps[1].drafts.filter((d) => d.key === `followup:${fuD.id}`);
eq(drafted.length, 1, 'Dash’s follow-up drafted on the second sync (the first matched its thread)');
eq(steps[0].drafts.filter((d) => d.key === `followup:${fuD.id}`).length, 0, 'not on the first: no new email instead of a reply');
const dd = drafted[0];
eq([dd.subject, dd.to, dd.cc, dd.attachments, dd.conversationId], [`RE: ${MARK} Club Yuppie and Dash`, [`dee@${m}-d.test`], [], ['Overview.pdf'], `${m}-conv-d`], 'in the thread, to Dee, with the first email’s attachment');
ok(dd.body.indexOf('just following up') < dd.body.indexOf('Dear Dee, the first email') && dd.body.includes('Any thoughts?'), 'Albert’s words above the quoted email');
const fuDone = sql1(`select status, touch_id, draft_id from outreach_followups where id = ${q(fuD.id)}`);
eq(fuDone.status, 'done', 'Albert sent it: the follow-up is done');
eq(sql1(`select kind, step, status, created_by from outreach_touches where id = ${q(fuDone.touch_id)}`), { kind: 'follow_up', step: 1, status: 'sent', created_by: 'drafter' }, 'logged as the follow-up email');
const jan = sql1(`select status, reason, due_on::text d from outreach_followups where target_id = ${q(T.d)} and step = 2`);
ok(jan && jan.d >= '2027-01-11' && jan.d <= '2027-01-15', 'the January email was scheduled in the round', jan);
eq([jan.status, jan.reason], ['cancelled', 'replied'], 'and their reply cancelled it');
eq(sql1(`select stage from outreach_targets where id = ${q(T.d)}`).stage, 'replied', 'Dash: Replied');
eq(sql1(`select status from outreach_draft_texts where followup_id = ${q(fuD.id)}`).status, 'drafted', 'the words marked drafted');

// syncs recorded; audit rows hold numbers only
const runs = sql(`select ok, counts from outreach_sync_runs where finished_at > now() - interval '30 minutes' order by started_at desc limit 4`);
ok(runs.length === 4 && runs.every((x) => x.ok), 'each sync recorded as OK', runs);
const audits = sql(`select details::text d from admin_audit where action = 'desk.drafter.report' and created_at > now() - interval '30 minutes'`);
ok(audits.length >= 4 && audits.every((a) => !a.d.includes('@') && !a.d.includes(MARK)), 'the drafter’s audit rows hold counts only');

// a second run of the whole mailbox changes nothing
const counts = () => sql1(`select (select count(*) from outreach_targets)::int tg, (select count(*) from outreach_touches)::int x, (select count(*) from outreach_outcomes)::int o,
  (select count(*) from outreach_followups)::int f, (select count(*) from outreach_contacts)::int c`);
const before = counts();
const again = drafter({ messages: structuredClone(messages), steps: [{ sync: { args: ['--since', '2026-11-01'] } }] });
eq(again[0].code, 0, 'a second run from 1 Nov', again[0].out);
eq(counts(), before, 'changes nothing');

// ============================================================================================ the review list
let page = await fetch(`${BASE}/admin/desk/today`, { headers: { Cookie: cookieFor(owner) }, redirect: 'manual' }).then((x) => x.text());
ok(page.includes('To check') && page.includes('Hello from Maria') && page.includes('Typed by hand'), 'Today shows what to check');
r = await run('deskConfirmOutcome', { outcome: maria.id, target: T.b });
ok(r.redirect?.endsWith('?done=confirmed'), 'Confirm Maria’s reply for Nobu', r);
const mariaNow = sql1(`select confirmed, contact_id from outreach_outcomes where id = ${q(maria.id)}`);
ok(mariaNow.confirmed && mariaNow.contact_id, 'confirmed, and Maria is a contact now');
eq(sql1(`select email_source from outreach_contacts where id = ${q(mariaNow.contact_id)}`).email_source, 'their_reply', 'her address came from her reply');
eq([sql1(`select stage from outreach_targets where id = ${q(T.b)}`).stage, sql1(`select status, reason from outreach_followups where target_id = ${q(T.b)} and step = 1`)],
  ['replied', { status: 'cancelled', reason: 'replied' }], 'Nobu: Replied, its follow-up stopped');
r = await run('deskConfirmTouch', { touch: cSend.id, target: T.c, kind: 'conversation' });
ok(r.redirect?.endsWith('?done=confirmed'), 'Confirm the hand-typed email as a conversation', r);
eq(sql1(`select status, kind, step from outreach_touches where id = ${q(cSend.id)}`), { status: 'sent', kind: 'conversation', step: null }, 'logged in the conversation, not counted as outreach');
// one to ignore: a probable reply that wasn't
const stray = drafter({
  messages: [{ folder: 'inbox', subject: 'Newsletter', from: person(`news@${m}-a.test`), receivedDateTime: later(3), internetMessageId: `<${m}-s1@fake>`, bodyText: 'Our menu' }],
  steps: [{ sync: {} }],
});
eq(stray[0].code, 0, 'a newsletter from Rosa’s domain', stray[0].out);
const news = sql1(`select id, confirmed from outreach_outcomes where internet_message_id = ${q(`<${m}-s1@fake>`)}`);
eq(news?.confirmed, false, 'waits in the review list');
r = await run('deskIgnoreOutcome', { outcome: news.id });
ok(r.redirect?.endsWith('?done=ignored'), 'Not a partner’s: ignored', r);
drafter({ messages: [{ folder: 'inbox', subject: 'Newsletter', from: person(`news@${m}-a.test`), receivedDateTime: later(3), internetMessageId: `<${m}-s1@fake>`, bodyText: 'Our menu' }], steps: [{ sync: { args: ['--since', '2026-11-01'] } }] });
eq(sql1(`select count(*)::int n from outreach_outcomes where internet_message_id = ${q(`<${m}-s1@fake>`)}`).n, 0, 'and it never comes back');

// ============================================================================================ the screens
page = await fetch(`${BASE}/admin/desk/settings`, { headers: { Cookie: cookieFor(owner) }, redirect: 'manual' }).then((x) => x.text());
ok(page.includes('Linked') && page.includes(FP.slice(0, 12)) && !page.includes(KEY), 'Settings: linked, the fingerprint’s start, never the key');
page = await fetch(`${BASE}/admin/desk`, { headers: { Cookie: cookieFor(owner) }, redirect: 'manual' }).then((x) => x.text());
ok(/Outlook synced/.test(page), 'the desk says when Outlook last synced');
page = await fetch(`${BASE}/admin/desk/t/${T.a}`, { headers: { Cookie: cookieFor(owner) }, redirect: 'manual' }).then((x) => x.text());
ok(page.includes('Open in Outlook') && page.includes('Overview.pdf'), 'a partner’s timeline links to Outlook and names the attachment');
page = await fetch(`${BASE}/admin/desk/t/${T.b}`, { headers: { Cookie: cookieFor(other) }, redirect: 'manual' });
ok(page.status === 307 || page.status === 303 || page.status === 302, 'another admin still can’t see a partner');

// ============================================================================================ unlink
r = await action(DESK('deskUnlinkDrafter'), [fd({})], other);
eq((await door('hello')).status, 200, 'another admin can’t unlink it');
r = await run('deskUnlinkDrafter', {});
ok(r.redirect?.endsWith('?done=unlinked'), 'Unlink', r);
eq((await door('hello')).status, 401, 'after unlinking, the drafter is refused at once');
const after = drafter({ messages: [], steps: [{ sync: {} }] });
ok(after[0].code === 1 && after[0].out.includes("isn't linked any more"), 'and the drafter says so', after[0].out);

// tidy up this run's partners
exec(`delete from outreach_targets where name like ${q(`${MARK}%`)}`);
done();
