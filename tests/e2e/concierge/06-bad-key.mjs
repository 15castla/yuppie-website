// The Concierge with a key that is not a key (7 Nov 2026): on 4 Nov a whole pasted command went into
// ANTHROPIC_API_KEY, the request could not be made, and the error printed the value in the server log. Now the
// value is checked first: the question fails plainly, nothing is sent, and no part of the value reaches the log.
// Its own server, with a made-up value shaped like that paste (not a real key):
//
//   PORT=3103 ANTHROPIC_API_KEY="$(cat tests/e2e/concierge/bad-key.txt)" bash /home/claude/build-concierge/server.sh start
//   CONCIERGE_LOG=/tmp/concierge-3103.log PHASE_B_BASE=http://localhost:3103 PHASE_B_TAG=bc. node tests/e2e/concierge/06-bad-key.mjs
import fs from 'node:fs';
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, q, rand, sql1 } from '../phase-b/lib.mjs';

const APP_UA = 'Mozilla/5.0 YuppieNativeApp';
const FAKE = 'https://fake-anthropic.test/__fake/anthropic';
const LOG = process.env.CONCIERGE_LOG;
if (!LOG) throw new Error('CONCIERGE_LOG: the server log to check');
const bad = fs.readFileSync(new URL('./bad-key.txt', import.meta.url), 'utf8').trim();
const pieces = ['NOTAREALKEY', 'qa-made-up', bad.split('x-api-key: ')[1]?.slice(0, 20)].filter(Boolean);

await fetch(`${FAKE}/mode`, { method: 'POST', body: JSON.stringify({ mode: 'reply' }) });
await fetch(`${FAKE}/clear`, { method: 'POST', body: '{}' });
const M = await makeMemberWithPhoto(`bk${rand()}`);
const headers = { 'content-type': 'application/json', 'user-agent': APP_UA, cookie: `${cookieFor(M.session)}; is-native-app=1` };
const r = await fetch(`${BASE}/api/test-hooks/concierge.sendConciergeMessage`, { method: 'POST', headers, body: JSON.stringify({ args: ['Somewhere for supper?'] }) }).then((x) => x.json());
eq(r.result?.ok, false, 'bad key: the question fails (the screen says Not sent)');
eq((await (await fetch(`${FAKE}/requests`)).json()).length, 0, 'bad key: nothing is sent');
eq(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(M.id)} and failed_at is not null`).n, 1, 'bad key: the question is kept as failed');
await new Promise((res) => setTimeout(res, 300));
const log = fs.readFileSync(LOG, 'utf8');
ok(log.includes('ANTHROPIC_API_KEY is not a valid API key value'), 'bad key: the log says what is wrong');
ok(pieces.every((p) => !log.includes(p)), 'bad key: no part of the value is in the log');
done();
