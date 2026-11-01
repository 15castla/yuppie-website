// The Concierge with CONCIERGE_LIVE off (the server started with CONCIERGE_LIVE=off): the page is the example
// screen as before (here MEMBERS_SHOW_EXAMPLES=on), the real actions are 404s, and nothing is written.
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, q, rand, sql1 } from '../phase-b/lib.mjs';
const APP_UA = 'Mozilla/5.0 YuppieNativeApp';
const M = await makeMemberWithPhoto(`nl${rand()}`);
const headers = { 'user-agent': APP_UA, cookie: `${cookieFor(M.session)}; is-native-app=1` };
const pg = await fetch(`${BASE}/members/concierge`, { headers });
const html = await pg.text();
eq(pg.status, 200, 'not live: the page opens in the app');
ok(html.includes('Try asking'), 'not live: the example screen, as before');
for (const name of ['getConcierge', 'sendConciergeMessage', 'forgetConciergeMemory', 'forgetAllConciergeMemory']) {
  const r = await fetch(`${BASE}/api/test-hooks/concierge.${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ args: ['x'] }) }).then((x) => x.json());
  eq(r.notFound, true, `not live: ${name} is a 404`);
}
eq(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(M.id)}`).n, 0, 'not live: nothing written');
done();
