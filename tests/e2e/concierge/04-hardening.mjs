// The Concierge hardening (7 Nov 2026), on the default model (Sonnet 5.5), against the same server as
// 01-concierge.mjs: a busy API is tried again, an answer written in words is still an answer, and a model that
// refuses the effort setting is asked without it. Run it after 01 and 02: the last part changes what the server
// remembers about the model until it is restarted.
//
//   PHASE_B_BASE=http://localhost:3101 PHASE_B_TAG=bc. node tests/e2e/concierge/04-hardening.mjs
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, q, rand, sql1 } from '../phase-b/lib.mjs';

const APP_UA = 'Mozilla/5.0 YuppieNativeApp';
const FAKE = 'https://fake-anthropic.test/__fake/anthropic';
const NUDGE = 'Now send your answer with the reply tool.';
const mode = (m) => fetch(`${FAKE}/mode`, { method: 'POST', body: JSON.stringify({ mode: m }) });
const clear = () => fetch(`${FAKE}/clear`, { method: 'POST', body: '{}' });
const requests = async () => (await fetch(`${FAKE}/requests`)).json();
async function send(m, text) {
  const headers = { 'content-type': 'application/json', 'user-agent': APP_UA, cookie: `${cookieFor(m.session)}; is-native-app=1` };
  const r = await fetch(`${BASE}/api/test-hooks/concierge.sendConciergeMessage`, { method: 'POST', headers, body: JSON.stringify({ args: [text] }) });
  return (await r.json()).result;
}

const H = await makeMemberWithPhoto(`hd${rand()}`);

// A busy API (529 overloaded) is tried again on its own, and the member sees an answer.
await mode('flaky'); await clear();
const r1 = await send(H, 'Somewhere for supper on Thursday?');
ok(r1?.recommendations?.length === 2, 'busy API: tried again, and answers', r1);
{
  const reqs = await requests();
  eq(reqs.length, 2, 'busy API: two calls, the second one answered');
  eq(JSON.stringify(reqs[0].body), JSON.stringify(reqs[1].body), 'busy API: the same request again');
}

// It answers in words and, asked for the reply tool, in words again: the words are the answer (no places, since a
// place needs a source the search returned).
await mode('text-always'); await clear();
const r2 = await send(H, 'Anything near Angel?');
eq(r2?.text, 'Calder & Co, on Mill Street, is quiet enough to talk.', 'answer in words: shown as the answer');
ok(!r2.recommendations && !r2.sources, 'answer in words: no places, no sources', r2);
{
  const reqs = await requests();
  eq(reqs.length, 2, 'answer in words: asked for the reply tool once');
  eq(reqs[1].body.messages.at(-1), { role: 'user', content: NUDGE }, 'answer in words: the ask is the last message');
}
eq(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(H.id)} and role = 'concierge'`).n, 2, 'answer in words: saved like any reply');

// The model refuses the effort setting (a 400 naming output_config): asked again without it, and not sent it again.
await mode('no-effort'); await clear();
const r3 = await send(H, 'Brunch on Sunday?');
ok(r3?.recommendations?.length === 2, 'effort refused: asked without it, and answers', r3);
{
  const reqs = await requests();
  eq(reqs.map((r) => Boolean(r.body.output_config)), [true, false], 'effort refused: the second call leaves it out');
}
await clear();
const r4 = await send(H, 'And a Sunday walk after?');
ok(r4?.recommendations?.length === 2, 'effort refused: the next question answers');
eq((await requests()).map((r) => Boolean(r.body.output_config)), [false], 'effort refused: remembered, one call');

await mode('reply');
done();
