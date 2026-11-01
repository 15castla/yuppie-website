// The Concierge, for real (1 Nov 2026): the server actions, the page, the database and the AI call, on a
// production build with the Concierge flag on and live, against the local stack and a fake of the Anthropic API
// (the fakes server at fake-anthropic.test; ANTHROPIC_BASE_URL points there in tests only).
//
//   bash /home/claude/build-concierge/server.sh build && bash /home/claude/build-concierge/server.sh start
//   PHASE_B_BASE=http://localhost:3101 PHASE_B_TAG=bc. node tests/e2e/concierge/01-concierge.mjs
//
// The server runs with CONCIERGE_DAILY_LIMIT=6.
import {
  BASE, action, cookieFor, done, eq, exec, makeMemberWithPhoto, ok, page, q, rand, rest, sql1,
} from '../phase-b/lib.mjs';

const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const FAKE = 'https://fake-anthropic.test/__fake/anthropic';
const RUN = `cg${rand()}`;
const appHeaders = (m) => ({ 'user-agent': APP_UA, cookie: `${cookieFor(m.session)}; is-native-app=1` });
async function app(name, args, m) {
  const r = await fetch(`${BASE}/api/test-hooks/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...appHeaders(m) }, body: JSON.stringify({ args }) });
  return r.json();
}
const mode = (m) => fetch(`${FAKE}/mode`, { method: 'POST', body: JSON.stringify({ mode: m }) });
const clear = () => fetch(`${FAKE}/clear`, { method: 'POST', body: '{}' });
const requests = async () => (await fetch(`${FAKE}/requests`)).json();
const send = async (m, text) => (await app('concierge.sendConciergeMessage', [text], m)).result;
const count = (m, role) => sql1(`select count(*)::int n from concierge_messages where member_id = ${q(m.id)}${role ? ` and role = ${q(role)}` : ''}`).n;
const NO_STYLE = /[—–!]|\p{Extended_Pictographic}/u;

// ---------------------------------------------------------------- the door
const A = await makeMemberWithPhoto(`${RUN}a`, 'active', { full_name: 'Alex Asker' });
await mode('reply'); await clear();
eq((await action('concierge.getConcierge', [], A.session)).notFound, true, 'web: the actions are a 404 (app only)');
{
  const w = await fetch(`${BASE}/members/concierge`, { headers: { cookie: cookieFor(A.session) } });
  const body = await w.text();
  ok(w.status === 404 || (body.includes('NEXT_HTTP_ERROR_FALLBACK;404') && !body.includes('Try asking')), `web: the page is a 404 (${w.status}; streamed after the shell)`);
}
const pg = await page('/members/concierge', A.session, appHeaders(A));
eq(pg.status, 200, 'app: the page opens');
ok(pg.text.includes('Try asking') && pg.text.includes('Somewhere for supper on Thursday'), 'app: first open, the three suggestions');
ok(!/Example screen|Example content/.test(pg.text), 'app: no example note (the real Concierge)');
const snap0 = (await app('concierge.getConcierge', [], A)).result;
eq([snap0.messages.length, snap0.memory.length, snap0.suggestions.length], [0, 0, 3], 'load: no conversation, no memory, three suggestions');

// ---------------------------------------------------------------- one question, one reply
const r1 = await send(A, 'Somewhere for supper on Thursday, four of us, nothing too loud.');
ok(r1 && r1.id && /^\d{2}:\d{2}$/.test(r1.at), 'send: a reply with an id and a time', r1);
eq(r1.text, 'Two good ones for Thursday, both quiet enough to talk.', 'send: the first paragraph');
eq(r1.recommendations.length, 2, 'send: two places');
ok(r1.recommendations.every((p) => p.mapsUrl.startsWith('https://maps.apple.com/?q=') && p.facts.length <= 2 && p.address && p.why), 'send: each place has why, at most two facts, an address and an Open in Maps link');
eq(r1.sources.map((s) => s.label), ['calder.example.test', 'guide.example.test'], 'send: the sources are the pages the search returned');
eq([count(A, 'member'), count(A, 'concierge')], [1, 1], 'send: the question and the reply are saved');
const req1 = (await requests()).at(-1);
ok(req1.headers.key && req1.headers.version === '2023-06-01', 'AI call: the key and the API version are sent');
eq(req1.body.model, 'claude-sonnet-5-5', 'AI call: the default model');
const ws = req1.body.tools.find((t) => t.name === 'web_search');
ok(ws && ws.type === 'web_search_20250305' && ws.max_uses === 3 && ws.user_location.city === 'London', 'AI call: web search, three at most, in London');
ok(req1.body.tools.some((t) => t.name === 'reply') && req1.body.tool_choice.type === 'any', 'AI call: the reply tool, and a tool must be used');
ok(/never book/i.test(req1.body.system) && /You recommend/.test(req1.body.system), 'AI call: the never-books rule is in the instructions');
ok(req1.body.system.includes(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long' }).format(new Date())), 'AI call: today’s date in London');
eq(req1.body.messages.at(-1), { role: 'user', content: 'Somewhere for supper on Thursday, four of us, nothing too loud.' }, 'AI call: the question is the last message');

// ---------------------------------------------------------------- memory
await mode('memory');
const r2 = await send(A, 'We like it quiet, honestly.');
ok(r2.remembered && r2.remembered.text === 'Likes quiet places', 'memory: learned and returned', r2.remembered);
eq(sql1(`select count(*)::int n from concierge_memory where member_id = ${q(A.id)}`).n, 1, 'memory: saved');
const r3 = await send(A, 'Another quiet one please');
eq(r3.remembered, undefined, 'memory: the same line is not learned twice');
const req3 = (await requests()).at(-1);
ok(req3.body.system.includes('- Likes quiet places'), 'memory: what it knows goes into the instructions');
const roles = req3.body.messages.map((m) => m.role);
ok(roles[0] === 'user' && roles.every((r, i) => i === 0 || r !== roles[i - 1]) && roles.at(-1) === 'user', 'history: turns alternate, starting and ending with the member', roles);
ok(req3.body.messages.some((m) => m.role === 'assistant' && m.content.includes('Recommended: Calder & Co')), 'history: earlier places go back as plain words');
const snap1 = (await app('concierge.getConcierge', [], A)).result;
eq([snap1.messages.length, snap1.memory.map((m) => m.text)], [6, ['Likes quiet places']], 'load: the conversation and the memory persist');
ok(snap1.messages[1].recommendations?.length === 2 && snap1.messages[1].sources?.length === 2, 'load: a saved reply keeps its places and sources');
eq((await app('concierge.forgetConciergeMemory', ['not-an-id'], A)).result, { ok: true }, 'forget: a junk id is ignored');
eq((await app('concierge.forgetConciergeMemory', [snap1.memory[0].id], A)).result, { ok: true }, 'forget: one item');
eq(sql1(`select count(*)::int n from concierge_memory where member_id = ${q(A.id)}`).n, 0, 'forget: gone');
eq(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(A.id)} and reply ? 'remembered'`).n, 0, 'forget: and gone from the reply that learned it (no Remembered chip after a reload)');
await mode('memory'); await send(A, 'Quiet again');
eq((await app('concierge.forgetAllConciergeMemory', [], A)).result, { ok: true }, 'forget everything');
eq(sql1(`select count(*)::int n from concierge_memory where member_id = ${q(A.id)}`).n, 0, 'forget everything: nothing left');
ok(count(A) > 0, 'forget everything: the conversation stays');

// ---------------------------------------------------------------- the rules it is held to
const B = await makeMemberWithPhoto(`${RUN}b`);
await mode('books-once'); await clear();
const rb = await send(B, 'Book me somewhere for Friday');
ok(!/book you a table|reserve it/i.test(JSON.stringify(rb)), 'never books: an offer to book is asked again', rb);
const breqs = await requests();
eq(breqs.length, 2, 'never books: two calls');
ok(breqs[1].body.system.includes('You never do that'), 'never books: the second call is reminded');
await mode('books-always');
const rb2 = await send(B, 'Book it');
ok(!/book you a table/i.test(rb2.text) && !(rb2.steps ?? []).some((s) => /I can book/i.test(s)) && !rb2.closing, 'never books: a second offer is dropped from the reply', rb2);
ok((rb2.steps ?? []).includes('Ring them and ask for the round table.'), 'never books: advice to ring themselves stays');
await mode('text'); await clear();
const rt = await send(B, 'Anything near Angel?');
ok(rt.recommendations?.length === 2, 'no reply tool: asked for it once, and answers');
eq((await requests())[1].body.tool_choice, { type: 'tool', name: 'reply' }, 'no reply tool: the second call forces it');
await mode('pause'); await clear();
const rp = await send(B, 'Brunch on Sunday?');
ok(rp.recommendations?.length === 2, 'pause_turn: carries on and answers');
ok((await requests())[1].body.messages.some((m) => m.role === 'assistant' && Array.isArray(m.content)), 'pause_turn: the paused turn goes back as it was');
await mode('badsource');
const rs = await send(B, 'Somewhere new');
ok(!rs.recommendations && !rs.sources, 'a place whose source the search did not return is not shown (it was not checked)', rs);
await mode('style');
const ry = await send(B, 'Go on then');
ok(!NO_STYLE.test(ry.text), `house style: no dashes, exclamation marks or emoji ("${ry.text}")`);
eq(ry.recommendations[0].facts, ['Garden'], 'facts: a time is never a fact');
const B2 = await makeMemberWithPhoto(`${RUN}b2`);   // B has used its six questions for the day
await mode('steps');
const rsteps = await send(B2, 'Birthday dinner for eight on Saturday');
ok(rsteps.steps?.length === 2 && !rsteps.recommendations, 'a plan in steps, no places');
eq(rsteps.sources?.map((x) => x.label), ['guide.example.test'], 'its sources: only the pages the search returned');
await mode('clarify');
const rc = await send(B2, 'Dinner?');
ok(rc.text.includes('Which part of town') && !rc.recommendations, 'a question back, no places', rc);

// ---------------------------------------------------------------- when it fails
const before = count(B2);
const shownBefore = (await app('concierge.getConcierge', [], B2)).result.messages.length;
await mode('error');
const fail = await app('concierge.sendConciergeMessage', ['This one fails'], B2);
eq(fail.result?.ok, false, 'the AI down: the action fails (the screen says Not sent)');
eq(count(B2), before + 1, 'the AI down: the question is kept...');
eq(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(B2.id)} and failed_at is not null`).n, 1, '...as failed (it counts for the day, so failures cannot run up the bill)');
eq((await app('concierge.getConcierge', [], B2)).result.messages.length, shownBefore, 'the AI down: a failed question is not shown');
await mode('cutoff');
eq((await app('concierge.sendConciergeMessage', ['Cut off'], B2)).result?.ok, false, 'an answer cut off (max_tokens) is a failure, not half a reply');
await mode('reply');
const again = await send(B2, 'This one fails');
ok(again?.recommendations?.length === 2, 'Try again: answers');
const lastReq = (await requests()).at(-1);
ok(!lastReq.body.messages.some((m) => typeof m.content === 'string' && m.content.includes('Cut off')), 'a failed question is never sent back as history');

// ---------------------------------------------------------------- limits and one at a time
const C = await makeMemberWithPhoto(`${RUN}c`);
await mode('reply');
for (let i = 0; i < 6; i++) await send(C, `Question ${i + 1}`);
await clear();
const lim = await send(C, 'Question 7');
ok(/plenty of questions/i.test(lim.text), 'daily limit: a plain line after six', lim);
eq((await requests()).length, 0, 'daily limit: no AI call');
eq(count(C, 'member'), 6, 'daily limit: not saved');
const D = await makeMemberWithPhoto(`${RUN}d`);
exec(`insert into concierge_messages (member_id, role, body) values (${q(D.id)}, 'member', 'still thinking')`);
const busy = await send(D, 'And another');
ok(/Still working/i.test(busy.text), 'one at a time: a question while one is unanswered waits', busy);
eq((await app('concierge.getConcierge', [], D)).result.messages.length, 0, 'load: an unanswered question is not shown');
exec(`update concierge_messages set created_at = now() - interval '5 minutes' where member_id = ${q(D.id)}`);
await app('concierge.getConcierge', [], D);
eq(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(D.id)} and failed_at is not null`).n, 1, 'load: an unanswered question older than the busy window is marked failed (still counts for the day)');
ok((await send(D, 'Now?'))?.recommendations, 'and then it answers');
const long = await send(D, 'x'.repeat(501));
ok(/500 characters/.test(long.text), 'over 500 characters: a plain line, nothing sent');

// ---------------------------------------------------------------- a reply that finishes too late is not saved
const G = await makeMemberWithPhoto(`${RUN}g`);
exec(`insert into concierge_messages (member_id, role, body, failed_at) values (${q(G.id)}, 'member', 'given up', now())`);
const gaveUp = sql1(`select id from concierge_messages where member_id = ${q(G.id)}`).id;
eq(sql1(`select public.concierge_save_reply(${q(G.id)}, ${q(gaveUp)}, 'late', '{}'::jsonb, null, 30)->>'status' s`).s, 'gone', 'save_reply: a question given up gets no reply');
eq(sql1(`select public.concierge_save_reply(${q(G.id)}, gen_random_uuid(), 'late', '{}'::jsonb, null, 30)->>'status' s`).s, 'gone', 'save_reply: nor a question that is not there');
exec(`insert into concierge_messages (member_id, role, body) values (${q(G.id)}, 'member', 'fine')`);
const fine = sql1(`select id from concierge_messages where member_id = ${q(G.id)} and failed_at is null`).id;
const saved = sql1(`select public.concierge_save_reply(${q(G.id)}, ${q(fine)}, 'ok', '{}'::jsonb, 'Likes jazz', 30) r`).r;
ok(saved.status === 'ok' && saved.memory_text === 'Likes jazz', 'save_reply: saves the reply and what it learned');
eq(sql1(`select reply->'remembered'->>'text' txt from concierge_messages where id = ${q(saved.id)}`).txt, 'Likes jazz', 'save_reply: the reply carries its Remembered line');
for (let i = 0; i < 3; i++) {
  exec(`insert into concierge_messages (member_id, role, body) values (${q(G.id)}, 'member', 'q${i}')`);
  const qid = sql1(`select id from concierge_messages where member_id = ${q(G.id)} and role = 'member' and body = 'q${i}'`).id;
  sql1(`select public.concierge_save_reply(${q(G.id)}, ${q(qid)}, 'ok', '{}'::jsonb, 'Likes thing ${i}', 2) r`);
}
eq(sql1(`select count(*)::int n from concierge_memory where member_id = ${q(G.id)}`).n, 2, 'save_reply: the memory cap keeps the newest lines');
exec(`update members set deleted_at = now() where id = ${q(G.id)}`);
exec(`insert into concierge_messages (member_id, role, body) values (${q(G.id)}, 'member', 'after deletion')`);
const afterDel = sql1(`select id from concierge_messages where member_id = ${q(G.id)} and body = 'after deletion'`).id;
eq(sql1(`select public.concierge_save_reply(${q(G.id)}, ${q(afterDel)}, 'late', '{}'::jsonb, null, 30)->>'status' s`).s, 'gone', 'save_reply: not for a deleted account');

// ---------------------------------------------------------------- security
const asMemberRest = await rest('GET', `concierge_messages?select=*&member_id=eq.${A.id}`, A.session);
ok(asMemberRest.status === 401 || asMemberRest.status === 403, `REST: a member cannot read the conversation (${asMemberRest.status})`);
const memRest = await rest('GET', 'concierge_memory?select=*', A.session);
ok(memRest.status === 401 || memRest.status === 403, `REST: nor the memory (${memRest.status})`);
const ins = await rest('POST', 'concierge_messages', A.session, { member_id: A.id, role: 'concierge', body: 'forged' });
ok(ins.status === 401 || ins.status === 403, `REST: nor write a reply (${ins.status})`);
const fn = await rest('POST', 'rpc/concierge_take_turn', A.session, { p_member: A.id, p_text: 'x', p_daily: 999, p_busy_seconds: 0 });
ok(fn.status === 401 || fn.status === 403 || fn.status === 404, `REST: nor call the turn function (${fn.status})`);
for (const f of ['concierge_save_reply', 'concierge_purge']) {
  const r = await rest('POST', `rpc/${f}`, A.session, f === 'concierge_purge' ? { p_member: A.id } : { p_member: A.id, p_question: A.id, p_body: 'x', p_reply: {}, p_memory: null, p_max_memory: 30 });
  ok(r.status === 401 || r.status === 403 || r.status === 404, `REST: a member cannot call ${f} (${r.status})`);
}
const anon = await rest('GET', 'concierge_messages?select=*', null);
ok(anon.status === 401 || anon.status === 403, `REST: anon gets nothing (${anon.status})`);
const P = await makeMemberWithPhoto(`${RUN}p`, 'paused');
const pr = await app('concierge.sendConciergeMessage', ['hi'], P);
ok(pr.redirect || pr.result?.ok === false || pr.notFound, 'a paused member cannot use it', pr);
eq(count(P), 0, 'a paused member: nothing saved');
const none = await fetch(`${BASE}/api/test-hooks/concierge.sendConciergeMessage`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': APP_UA, cookie: 'is-native-app=1' }, body: JSON.stringify({ args: ['hi'] }) }).then((r) => r.json());
ok(none.result?.sessionEnded === true, 'no session: SESSION_ENDED');

// ---------------------------------------------------------------- account deletion
const E = await makeMemberWithPhoto(`${RUN}e`);
await mode('memory'); await send(E, 'quiet please');
ok(count(E) === 2 && sql1(`select count(*)::int n from concierge_memory where member_id = ${q(E.id)}`).n === 1, 'deletion: before, a conversation and a memory');
await action('you.deleteMyAccount', ['delete'], E.session).catch(() => null);
eq([count(E), sql1(`select count(*)::int n from concierge_memory where member_id = ${q(E.id)}`).n], [0, 0], 'deletion: everything the Concierge had is gone');
await mode('reply');
done();
