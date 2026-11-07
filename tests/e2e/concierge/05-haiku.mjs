// The Concierge on Haiku 5.5 (7 Nov 2026), the model production used while the Sonnet 5.5 calls failed. Haiku does
// not think, so the tool choice can be forced, as before. Its own server: CONCIERGE_MODEL=claude-haiku-5-5.
//
//   PORT=3102 CONCIERGE_MODEL=claude-haiku-5-5 bash /home/claude/build-concierge/server.sh start
//   PHASE_B_BASE=http://localhost:3102 PHASE_B_TAG=bc. node tests/e2e/concierge/05-haiku.mjs
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, rand } from '../phase-b/lib.mjs';

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

const K = await makeMemberWithPhoto(`hk${rand()}`);

await mode('reply'); await clear();
const r1 = await send(K, 'Somewhere for supper on Thursday?');
ok(r1?.recommendations?.length === 2, 'haiku: answers', r1);
{
  const [req] = await requests();
  eq(req.body.model, 'claude-haiku-5-5', 'haiku: the model from CONCIERGE_MODEL');
  eq([req.body.tool_choice, req.body.output_config], [{ type: 'any' }, undefined], 'haiku: a tool must be used, and no effort setting (it does not think)');
}

await mode('text'); await clear();
const r2 = await send(K, 'Anything near Angel?');
ok(r2?.recommendations?.length === 2, 'haiku, no reply tool: asked for it once, and answers');
{
  const reqs = await requests();
  eq(reqs[1].body.tool_choice, { type: 'tool', name: 'reply' }, 'haiku, no reply tool: the second call forces it');
  eq(reqs[1].body.messages.at(-1), { role: 'user', content: NUDGE }, 'haiku, no reply tool: and asks in words');
}

// A model that refuses a forced choice (the API's 400 naming tool_choice) is asked with auto, and remembered.
await mode('refuse-forced'); await clear();
const r3 = await send(K, 'Brunch on Sunday?');
ok(r3?.recommendations?.length === 2, 'forced choice refused: asked with auto, and answers', r3);
eq((await requests()).map((r) => r.body.tool_choice.type), ['any', 'auto'], 'forced choice refused: the second call is auto');
await clear();
const r4 = await send(K, 'And a walk after?');
ok(r4?.recommendations?.length === 2, 'forced choice refused: the next question answers');
eq((await requests()).map((r) => r.body.tool_choice.type), ['auto'], 'forced choice refused: remembered, one call');

await mode('reply');
done();
