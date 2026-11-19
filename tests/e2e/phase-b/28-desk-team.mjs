// The Outreach Desk as a team desk (19 Nov 2026: Kira joins; Relationship Managers; a contact-only timeline with each
// meeting as one item; Partners and Prospects; personal settings), against the local stack and a production build.
// Checks:
//   the team: an admin with desk access (Kira, KW) has the whole desk with the owner's powers (the Desk link, every
//     page, adding and deleting); linking the Outlook drafter and connecting Alex stay the owner's;
//   Relationship Managers: a new partner's RM is whoever adds it (or who they choose, only from the team); the Blotter,
//     Today and Partners show each partner's code and filter by RM; Today is yours unless you pick Everyone;
//   Partners and Prospects: Partners opens on Agreed and Live, Prospects lists everyone else, a search looks in both;
//   the timeline: only contact; a bounce sits inside the email; a meeting is one item, "Meeting booked" then "Meeting",
//     holding the emails after the first reply that arranged it, its notes and action points; booking moves the stage
//     to Call booked; notes have their own panel; the stage's history; cancel and delete a meeting;
//   personal settings: each person's own email templates (Kira's suggested in her name), her Outlook not linked;
//   the drafter on the owner's Mac makes no drafts for Kira's partners; Alex (the owner's) lists and writes only the
//     owner's partners, sees the RM and the meetings, ties notes to a meeting; the 06:30 email has the owner's partners
//     and one line of numbers for Kira's.
//   node tests/e2e/phase-b/28-desk-team.mjs     (needs: seed.mjs --prefix bf. and dk.; bf. the owner, dk. Kira)
import crypto from 'node:crypto';
import fs from 'node:fs';
import { BASE, action, adminSession, cronAt, done, eq, exec, fakeState, fakesMark, fakesSince, fd, ok, page as rawPage, q, rand, redirectedTo, sql, sql1 } from './lib.mjs';

const RUN = rand();
const MARK = `T${RUN}`;
const NAME = (s) => `${MARK} TeamTest ${s}`;
const DESK = (name) => `admin.desk.${name}`;
const ALEX = (name) => `admin.desk-alex.${name}`;
const ownerSaved = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-bf.json', 'utf8'));
const kiraSaved = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-dk.json', 'utf8'));
const OWNER = ownerSaved.userId;
const KIRA = kiraSaved.userId;
// the owner is AC; dk. becomes Kira, KW, on the desk (put back at the end, so the other scripts still see her as an
// admin without the desk)
exec(`delete from outreach_targets where name like '% TeamTest %';
  update admin_users set is_owner = false where is_owner; update admin_users set is_owner = true where id = ${q(OWNER)};
  update admin_users set initials = null where initials in ('AC', 'KW') and id not in (${q(OWNER)}, ${q(KIRA)});
  update admin_users set initials = 'AC', full_name = 'Albert Castle', desk_access = true where id = ${q(OWNER)};
  update admin_users set initials = 'KW', full_name = 'Kira Woodd', desk_access = true where id = ${q(KIRA)};
  delete from outreach_guidance where admin_id in (${q(OWNER)}, ${q(KIRA)});`);
const owner = await adminSession('bf.');
const kira = await adminSession('dk.');
const as = (who) => (name, fields) => action(DESK(name), [fd(fields)], who);
const albertDoes = as(owner);
const kiraDoes = as(kira);
const idFrom = (redirect) => /\/admin\/desk\/t\/([0-9a-f-]{36})/.exec(redirect ?? '')?.[1];
// Today's own list (the To check list above it names every partner, to move an email to another)
const todayList = (html) => html.slice(html.indexOf('id="t-h"'), html.indexOf('id="r-h"'));
const rows = (html) => [...html.matchAll(/data-tl="([a-z_-]+)"/g)].map((m) => m[1]);
const today = new Date().toISOString().slice(0, 10);
// a moment as the UK time a datetime-local field holds ("2026-11-22T10:00")
const ukLocal = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(' ', 'T');
// the page's text without React's markers between adjacent words
const page = async (path, who) => {
  const r = await rawPage(path, who);
  return { ...r, text: r.text.replace(/<!-- -->/g, '') };
};

// put things back however the script ends (ok() exits the process on a failure): Kira goes back to an admin without
// the desk; the drafter key this script linked is revoked
process.on('exit', () => {
  if (process.env.KEEP) return;
  exec(`update admin_users set desk_access = false where id = ${q(KIRA)}; update outreach_drafter_keys set revoked_at = now() where revoked_at is null;
    delete from outreach_targets where name like '% TeamTest %'; delete from outreach_guidance where admin_id = ${q(KIRA)};`);
});

{
  // ========================================================================================== the team
  let p = await page('/admin', kira);
  ok(p.status === 200 && p.text.includes('href="/admin/desk"'), 'Kira on the desk team: the Desk link');
  for (const path of ['/admin/desk', '/admin/desk/today', '/admin/desk/partners', '/admin/desk/settings', '/admin/desk/new']) {
    eq((await page(path, kira)).status, 200, `Kira: ${path} opens`);
  }
  eq(await redirectedTo('/admin/desk/connect?client_id=x', kira), '/admin/no-access', 'Kira: connecting Alex stays Albert’s');
  const keysBefore = sql1(`select count(*)::int n from outreach_drafter_keys`).n;
  let r = await kiraDoes('deskLinkDrafter', { fingerprint: 'a'.repeat(64) });
  ok(r.redirect?.startsWith('/admin/no-access') && sql1(`select count(*)::int n from outreach_drafter_keys`).n === keysBefore, 'Kira: linking the Outlook drafter stays Albert’s', r);
  r = await kiraDoes('deskUnlinkDrafter', {});
  ok(r.redirect?.startsWith('/admin/no-access'), 'and so does unlinking it', r);

  // ========================================================================================== Relationship Managers
  r = await kiraDoes('deskCreateTarget', { name: NAME('Copper Fern'), category: 'cafe', stage: 'researching', contact_name: `${MARK} Ivy`, contact_email: `${MARK.toLowerCase()}.ivy@copperfern.test` });
  const TK = idFrom(r.redirect);
  eq(sql1(`select rm from outreach_targets where id = ${q(TK)}`).rm, KIRA, 'Kira adds a partner: she is its RM');
  r = await albertDoes('deskCreateTarget', { name: NAME('Brass Lantern'), category: 'bar', stage: 'researching', contact_email: `${MARK.toLowerCase()}.ops@brasslantern.test` });
  const TA = idFrom(r.redirect);
  eq(sql1(`select rm from outreach_targets where id = ${q(TA)}`).rm, OWNER, 'Albert adds one: he is its RM');
  r = await albertDoes('deskCreateTarget', { name: NAME('Juniper Row'), category: 'restaurant', stage: 'agreed', rm: KIRA });
  const TJ = idFrom(r.redirect);
  eq(sql1(`select rm from outreach_targets where id = ${q(TJ)}`).rm, KIRA, 'or whoever he chooses from the team');
  r = await albertDoes('deskUpdateTarget', { target: TJ, name: NAME('Juniper Row'), category: 'restaurant', rm: crypto.randomUUID() });
  eq(sql1(`select rm from outreach_targets where id = ${q(TJ)}`).rm, KIRA, 'someone not on the desk can’t be made the RM');
  r = await kiraDoes('deskUpdateTarget', { target: TJ, name: NAME('Juniper Row'), category: 'restaurant', rm: OWNER });
  eq(sql1(`select rm from outreach_targets where id = ${q(TJ)}`).rm, OWNER, 'Kira hands one to Albert');
  await kiraDoes('deskUpdateTarget', { target: TJ, name: NAME('Juniper Row'), category: 'restaurant', rm: KIRA });

  // a first email each, so they're on the Blotter, and follow-ups
  const contactOf = (t) => sql1(`select id from outreach_contacts where target_id = ${q(t)} limit 1`).id;
  await kiraDoes('deskLogTouch', { target: TK, channel: 'email', kind: 'first', sent_at: '2026-11-10T09:00', to: contactOf(TK), subject: `${MARK} hello from Kira` });
  await albertDoes('deskLogTouch', { target: TA, channel: 'email', kind: 'first', sent_at: '2026-11-10T09:30', to: contactOf(TA), subject: `${MARK} hello from Albert` });
  exec(`update outreach_followups set due_on = ${q(today)} where target_id in (${q(TK)}, ${q(TA)})`);

  p = await page('/admin/desk?rm=KW', owner);
  ok(p.text.includes(NAME('Copper Fern')) && !p.text.includes(NAME('Brass Lantern')), 'the Blotter, KW: Kira’s partners only');
  p = await page('/admin/desk?rm=AC', owner);
  ok(p.text.includes(NAME('Brass Lantern')) && !p.text.includes(NAME('Copper Fern')), 'AC: Albert’s');
  p = await page('/admin/desk', owner);
  ok(p.text.includes(NAME('Brass Lantern')) && p.text.includes(NAME('Copper Fern')) && p.text.includes('>RM<') && p.text.includes('>KW<') && p.text.includes('>AC<'), 'everyone’s by default, with an RM column and the codes');
  ok(p.text.includes('Everyone') && p.text.includes('href="/admin/desk?rm=KW"'), 'and the RM switch');
  p = await page('/admin/desk/today', kira);
  let list = todayList(p.text);
  ok(list.includes(NAME('Copper Fern')) && !list.includes(NAME('Brass Lantern')) && list.includes('yours'), 'Today for Kira: her day, her partners');
  p = await page('/admin/desk/today?rm=all', kira);
  list = todayList(p.text);
  ok(list.includes(NAME('Copper Fern')) && list.includes(NAME('Brass Lantern')) && list.includes('everyone') && list.includes('dk-rm sm'), 'Everyone: the whole desk’s, each with its RM');
  p = await page('/admin/desk/today', owner);
  list = todayList(p.text);
  ok(list.includes(NAME('Brass Lantern')) && !list.includes(NAME('Copper Fern')), 'Today for Albert: his');
  r = await action(DESK('deskFollowup'), [fd({ followup: sql1(`select id from outreach_followups where target_id = ${q(TK)}`).id, op: 'unsnooze', back: '/admin/desk/today?rm=all' })], kira);
  eq(r.redirect, '/admin/desk/today?rm=all&done=followup', 'an action on Today comes back to the same RM view');

  // ========================================================================================== Partners and Prospects
  p = await page('/admin/desk/partners', owner);
  ok(p.text.includes(NAME('Juniper Row')) && !p.text.includes(NAME('Copper Fern')) && !p.text.includes(NAME('Brass Lantern')), 'Partners: the confirmed (Agreed or Live) only');
  ok(p.text.includes('Prospects') && p.text.includes('agreed or live'), 'with a Prospects tab');
  p = await page('/admin/desk/partners?view=prospects', owner);
  ok(p.text.includes(NAME('Copper Fern')) && p.text.includes(NAME('Brass Lantern')) && !p.text.includes(NAME('Juniper Row')), 'Prospects: everyone else');
  p = await page(`/admin/desk/partners?q=${encodeURIComponent(`${MARK} TeamTest`)}`, owner);
  ok(p.text.includes(NAME('Copper Fern')) && p.text.includes(NAME('Juniper Row')) && p.text.includes('Partners and prospects'), 'a search looks in both');
  p = await page('/admin/desk/partners?rm=KW', owner);
  ok(p.text.includes(NAME('Juniper Row')), 'and by RM');

  // ========================================================================================== the timeline
  r = await albertDoes('deskCreateTarget', { name: NAME('Linden Club'), category: 'fitness', stage: 'researching', contact_name: `${MARK} Naomi`, contact_email: `${MARK.toLowerCase()}.naomi@linden.test` });
  const T = idFrom(r.redirect);
  const naomi = contactOf(T);
  await albertDoes('deskLogTouch', { target: T, channel: 'email', kind: 'first', sent_at: '2026-11-02T09:00', to: naomi, new_email: `${MARK.toLowerCase()}.old@linden.test`, subject: `${MARK} first` });
  await albertDoes('deskLogOutcome', { target: T, kind: 'bounce', channel: 'email', received_at: '2026-11-02T09:01', bounced_address: `${MARK.toLowerCase()}.old@linden.test`, bounce_code: '5.1.1' });
  await albertDoes('deskLogOutcome', { target: T, kind: 'reply', channel: 'email', from_contact: naomi, received_at: '2026-11-04T10:00', sentiment: 'positive', body_text: `${MARK} yes let us meet` });
  await albertDoes('deskLogTouch', { target: T, channel: 'email', kind: 'conversation', sent_at: '2026-11-05T11:00', to: naomi, sequence: sql1(`select sequence_id from outreach_touches where target_id = ${q(T)} and kind = 'first'`).sequence_id, body_text: `${MARK} how about Thursday` });
  await albertDoes('deskLogOutcome', { target: T, kind: 'reply', channel: 'email', from_contact: naomi, received_at: '2026-11-06T12:00', body_text: `${MARK} Thursday works` });
  await albertDoes('deskAddNote', { target: T, kind: 'note', body: `${MARK} plain note about parking` });
  eq(sql1(`select stage from outreach_targets where id = ${q(T)}`).stage, 'replied', 'before booking: Replied');
  const soon = new Date(Date.now() + 3 * 86400_000);
  soon.setUTCHours(10, 0, 0, 0);
  r = await albertDoes('deskBookMeeting', { target: T, kind: 'meeting', starts_at: ukLocal(soon), title: 'At their studio' });
  ok(r.redirect?.endsWith('?done=meeting'), 'a meeting booked', r);
  const M1 = sql1(`select id, status, kind, starts_at, title from outreach_actions where target_id = ${q(T)} and kind = 'meeting'`);
  ok(M1?.status === 'open' && M1.title === 'At their studio', 'as an action point, open, with where', M1);
  eq(sql1(`select stage from outreach_targets where id = ${q(T)}`).stage, 'call_booked', 'booking moves the stage to Call booked');

  p = await page(`/admin/desk/t/${T}`, owner);
  eq(rows(p.text), ['meeting-booked', 'reply', 'email'], 'the timeline: the meeting booked, the first reply, the first email (nothing else at the top)');
  ok(p.text.includes('Meeting booked') && p.text.includes('How it was arranged') && p.text.includes(`${MARK} how about Thursday`) && p.text.includes(`${MARK} Thursday works`), 'inside the meeting: the emails that arranged it');
  ok(/data-tl="email"[\s\S]*?dk-att[\s\S]*?5\.1\.1/.test(p.text), 'the bounce sits inside the email it answers');
  ok(p.text.includes('id="nn-h"') && p.text.includes(`${MARK} plain note about parking`) && !rows(p.text).includes('note'), 'a plain note is in the Notes panel, not on the timeline');
  ok(p.text.includes('History') && p.text.includes('Replied to Call booked'), 'the stage’s history, under the stage');
  ok(p.text.includes('>RM<') && p.text.includes('Albert Castle'), 'the RM on the partner’s page');
  ok(p.text.includes('Next meeting') && !p.text.includes('Signed by'), 'Next meeting instead of Next call; no Signed by');

  // notes and an action point made inside the meeting are tied to it
  r = await albertDoes('deskAddNote', { target: T, meeting: M1.id, body: `${MARK} they will offer 15 percent` });
  const n1 = sql1(`select meeting_id, kind, happened_at from outreach_notes where target_id = ${q(T)} and body like '%15 percent'`);
  ok(n1.meeting_id === M1.id && n1.kind === 'meeting' && new Date(n1.happened_at).getTime() === new Date(M1.starts_at).getTime(), 'notes added in the meeting are tied to it, dated when it is', n1);
  r = await albertDoes('deskAddAction', { target: T, meeting: M1.id, kind: 'task', title: `${MARK} send the logo` });
  eq(sql1(`select meeting_id from outreach_actions where title = ${q(`${MARK} send the logo`)}`).meeting_id, M1.id, 'an action point from it is tied to it');
  r = await albertDoes('deskAddNote', { target: TA, meeting: M1.id, body: `${MARK} wrong partner` });
  eq(sql1(`select meeting_id from outreach_notes where body = ${q(`${MARK} wrong partner`)}`).meeting_id, null, 'another partner’s meeting can’t be used');
  p = await page(`/admin/desk/t/${T}`, owner);
  eq(rows(p.text), ['meeting-booked', 'reply', 'email'], 'still three rows');
  ok(p.text.includes(`${MARK} they will offer 15 percent`) && p.text.includes(`${MARK} send the logo`) && p.text.includes('1 action point'), 'with the notes and the action point inside the meeting');

  // a meeting that happened: logged in the past, with notes; it reads "Meeting"
  r = await albertDoes('deskBookMeeting', { target: T, kind: 'call', starts_at: '2026-11-03T16:00', notes: `${MARK} quick intro call` });
  ok(r.redirect?.endsWith('?done=meeting_logged'), 'a call in the past is logged', r);
  const C1 = sql1(`select id, status from outreach_actions where target_id = ${q(T)} and kind = 'call'`);
  eq(C1.status, 'done', 'as done');
  eq(sql1(`select meeting_id from outreach_notes where body = ${q(`${MARK} quick intro call`)}`).meeting_id, C1.id, 'its notes tied to it');
  p = await page(`/admin/desk/t/${T}`, owner);
  eq(rows(p.text), ['meeting-booked', 'reply', 'call-held', 'email'], 'the call that happened sits in its place, as Call');
  // an older call note on the same day as the call goes inside it too (Alex's, or an import's)
  exec(`insert into outreach_notes (target_id, kind, happened_at, body, source) values (${q(T)}, 'call', '2026-11-03T18:00:00Z', ${q(`${MARK} later thought`)}, 'assistant')`);
  p = await page(`/admin/desk/t/${T}`, owner);
  eq(rows(p.text), ['meeting-booked', 'reply', 'call-held', 'email'], 'a call note that day joins the call');

  // cancel, on again, delete
  r = await albertDoes('deskSetAction', { action: M1.id, op: 'cancel', back: `/admin/desk/t/${T}` });
  ok(r.redirect?.endsWith('?done=meeting_cancelled'), 'cancel the meeting', r);
  p = await page(`/admin/desk/t/${T}`, owner);
  ok(rows(p.text).includes('meeting-cancelled') && p.text.includes('Meeting cancelled'), 'it shows as cancelled');
  ok(rows(p.text).includes('conversation') || rows(p.text).filter((x) => x === 'email').length === 2, 'and the emails it held go back on the timeline', rows(p.text));
  await albertDoes('deskSetAction', { action: M1.id, op: 'reopen', back: `/admin/desk/t/${T}` });
  r = await albertDoes('deskDeleteAction', { target: T, action: M1.id });
  ok(r.redirect?.endsWith('?error=confirm'), 'deleting a meeting needs the tick', r);
  r = await kiraDoes('deskDeleteAction', { target: T, action: M1.id, confirm: 'delete' });
  ok(r.redirect?.endsWith('?done=action_deleted') && !sql1(`select id from outreach_actions where id = ${q(M1.id)}`), 'Kira can delete it (the same powers)', r);
  eq(sql1(`select meeting_id from outreach_notes where body like '%15 percent'`).meeting_id, null, 'its notes stay, no longer tied');
  r = await kiraDoes('deskDeleteTarget', { target: TJ, confirm: 'delete' });
  ok(r.redirect?.endsWith('?done=deleted') && !sql1(`select id from outreach_targets where id = ${q(TJ)}`), 'Kira can delete a partner');

  // ========================================================================================== personal settings
  p = await page('/admin/desk/settings', kira);
  ok(p.text.includes('Your email templates') && p.text.includes('Best,\nKira') && !p.text.includes('/api/desk/mcp'), 'Kira’s settings: her own templates, suggested in her name; no Alex connector');
  ok(p.text.includes('Your Outlook') && p.text.includes('Not linked yet'), 'her Outlook: not linked yet');
  ok(p.text.includes('The team') && p.text.includes('Kira Woodd') && p.text.includes('Albert Castle'), 'the team, with their codes');
  r = await action(ALEX('deskSaveGuidance'), [fd({ kind: 'follow_up', intent: 'approve', instructions: `${MARK} Kira's way`, example: 'Best,\nKira' })], kira);
  ok(r.redirect?.includes('done=guidance_approved'), 'Kira approves her own follow-up guidance', r);
  eq(sql(`select admin_id, approved_at is not null as approved from outreach_guidance where kind = 'follow_up' order by admin_id`).filter((g) => [OWNER, KIRA].includes(g.admin_id)), [{ admin_id: KIRA, approved: true }], 'it is hers only: Albert’s is untouched');
  p = await page('/admin/desk/settings', owner);
  ok(p.text.includes('id="alex"') && p.text.includes('/api/desk/mcp') && !p.text.includes(`${MARK} Kira&#x27;s way`) && !p.text.includes(`${MARK} Kira's way`), 'Albert’s settings: Alex, and his own (not Kira’s) guidance');

  // ========================================================================================== the drafter: no drafts for Kira's partners
  const KEY = crypto.randomBytes(32).toString('base64url');
  r = await albertDoes('deskLinkDrafter', { fingerprint: crypto.createHash('sha256').update(KEY).digest('hex') });
  ok(r.redirect?.endsWith('?done=linked'), 'Albert links his drafter');
  // both partners: the follow-up due, its words written, the first email known to Outlook
  for (const t of [TK, TA]) {
    exec(`update outreach_touches set internet_message_id = ${q(`<${MARK}-${t}@test>`)} where target_id = ${q(t)} and kind = 'first';
      update outreach_followups set status = 'scheduled', reason = null, due_on = ${q(today)} where target_id = ${q(t)}`);
    await action(DESK('deskSaveFollowupText'), [fd({ followup: sql1(`select id from outreach_followups where target_id = ${q(t)}`).id, body: `${MARK} following up` })], t === TK ? kira : owner);
  }
  const plan = await (await fetch(`${BASE}/api/desk/drafter/plan`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
  const ids = (plan.followups ?? []).map((f) => f.targetId);
  ok(ids.includes(TA) && !ids.includes(TK), 'the plan: Albert’s partner’s follow-up is drafted, Kira’s isn’t', ids);
  ok(plan.targets.some((t) => t.id === TK), 'but Kira’s partner is still looked for in Outlook');
  p = await page(`/admin/desk/t/${TK}`, kira);
  ok(p.text.includes('No draft is made for this partner') && p.text.includes('Kira'), 'Kira’s partner’s page says no draft is made, and to send it from her mailbox');

  // ========================================================================================== Alex (Albert's)
  const b64 = (buf) => Buffer.from(buf).toString('base64url');
  const CALLBACK = 'http://localhost:9917/callback';
  const reg = await (await fetch(`${BASE}/api/desk/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: `Claude ${MARK}`, redirect_uris: [CALLBACK] }) })).json();
  const verifier = b64(crypto.randomBytes(32));
  const fields = { response_type: 'code', client_id: reg.client_id, redirect_uri: CALLBACK, code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', state: 's', scope: 'desk' };
  r = await action(ALEX('deskConnectApprove'), [fd(fields)], kira);
  ok(r.redirect?.startsWith('/admin/no-access'), 'Kira can’t connect Alex', r);
  r = await action(ALEX('deskConnectApprove'), [fd(fields)], owner);
  const code = new URL(r.redirect).searchParams.get('code');
  const tok = await (await fetch(`${BASE}/api/desk/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: CALLBACK }).toString() })).json();
  let n = 1;
  const tool = async (name, args = {}) => {
    const res = await fetch(`${BASE}/api/desk/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } }) });
    const j = await res.json();
    return { error: j.result?.isError ? j.result.content?.[0]?.text : null, data: j.result?.isError ? null : JSON.parse(j.result?.content?.[0]?.text ?? 'null') };
  };
  await action(ALEX('deskSaveGuidance'), [fd({ kind: 'follow_up', intent: 'approve', instructions: 'Short.', example: 'Best,\nAlbert' })], owner);
  exec(`delete from outreach_draft_texts where target_id in (${q(TK)}, ${q(TA)})`);
  let t = await tool('desk_due_writing', { through: '2030-01-01' });
  const listed = (t.data?.followups ?? []).map((f) => f.partner);
  ok(listed.includes(NAME('Brass Lantern')) && !listed.includes(NAME('Copper Fern')), 'desk_due_writing: Albert’s partners only', listed);
  t = await tool('desk_save_draft_text', { followup_id: sql1(`select id from outreach_followups where target_id = ${q(TK)}`).id, body: 'Hi Ivy' });
  ok(t.error?.includes('Relationship Manager is Kira Woodd (KW)'), 'Alex can’t write for Kira’s partner, and says why', t);
  t = await tool('desk_save_draft_text', { followup_id: sql1(`select id from outreach_followups where target_id = ${q(TA)}`).id, body: 'Hi team' });
  ok(t.data?.saved, 'but writes Albert’s', t);
  t = await tool('desk_partner', { partner: NAME('Linden Club') });
  ok(t.data?.relationshipManager === 'Albert Castle (AC)' && Array.isArray(t.data?.meetings) && t.data.meetings.some((m) => m.what === 'Call'), 'desk_partner: the RM and the meetings', t.data?.meetings);
  t = await tool('desk_add_note', { partner: NAME('Linden Club'), meeting_id: C1.id, body: `${MARK} from the photo` });
  ok(t.data?.saved && sql1(`select meeting_id from outreach_notes where body = ${q(`${MARK} from the photo`)}`).meeting_id === C1.id, 'desk_add_note ties notes to a meeting', t);
  t = await tool('desk_add_note', { partner: NAME('Linden Club'), meeting_id: crypto.randomUUID(), body: 'x' });
  ok(t.error?.includes('No such meeting'), 'not to one that isn’t theirs', t);
  t = await tool('desk_search', { query: `${MARK} TeamTest Copper` });
  eq(t.data?.[0]?.relationshipManager, 'KW', 'desk_search: the RM');
  t = await tool('desk_today');
  ok(Array.isArray(t.data?.otherRelationshipManagers), 'desk_today: Albert’s day, with a line for the other RMs', t.data?.otherRelationshipManagers);

  // ========================================================================================== the 06:30 email
  exec(`delete from desk_agenda_runs where day = '2026-12-04';
    update outreach_followups set status = 'scheduled', reason = null, due_on = '2026-12-04', snoozed_until = null where target_id in (${q(TK)}, ${q(TA)})`);
  const mark = fakesMark();
  const c = await cronAt('desk-agenda', '2026-12-04T06:30:00Z');
  ok(c.json.ok && c.json.result.sent === true, 'the 06:30 email goes', c.json);
  const subject = fakesSince(mark, 'email')[0]?.subject;
  const mail = (await fakeState()).emails.filter((e) => e.subject === subject).at(-1);
  ok(mail?.text.includes(NAME('Brass Lantern')) && !mail.text.includes(NAME('Copper Fern')), 'it lists Albert’s partners, not Kira’s');
  ok(/Kira's partners \(KW\): \d+ due today/.test(mail?.text ?? ''), 'with one line of numbers for Kira’s', mail?.text);
  ok(JSON.stringify(mail?.to) === JSON.stringify(['albert@clubyuppie.com']), 'still only to albert@clubyuppie.com');
}
done();
