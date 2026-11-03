// The rules gate (app/members/require-member.ts, app/members/rules): a member who has not agreed is stopped at their
// next members page and sent back there after "I agree"; the agreement is saved once; the membership and photo gates
// still come first, with no loop between the three; Help keeps a copy open to everyone; the server sets it, never the
// member. Same server as 01.
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, done, eq, exec, makeMemberWithPhoto, memberSession, makeMember, ok, q, rand, sql1, REST, ANON } from '../phase-b/lib.mjs';

// Where a page sent the browser: a real redirect's Location, or (members pages stream the shell first, so their
// redirect() arrives in the stream) the NEXT_REDIRECT target in the body. rendered: the page drew itself.
const page = async (path, session) => {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie: cookieFor(session) } });
  const body = r.status === 200 ? await r.text() : '';
  const m = /NEXT_REDIRECT;(?:replace|push);([^;"\\]+);/.exec(body);
  return { status: r.status, location: r.headers.get('location') ?? (m ? m[1] : null), body, rendered: r.status === 200 && !m };
};

// a member who has not agreed
const A = await makeMemberWithPhoto(`rg${rand()}`, 'active', { rules_agreed_at: null });
let r = await page('/members/open-invite', A.session);
eq(r.location, '/members/rules', 'gate: an unagreed member is sent to the rules (from the landing page: no ?next=)');
r = await page('/members/events', A.session);
eq(r.location, '/members/rules?next=%2Fmembers%2Fevents', 'gate: on every members page');
r = await page('/members/rules', A.session);
ok(r.rendered && r.body.includes('Community') && r.body.includes('zero tolerance') && r.body.includes('within 24 hours') && r.body.includes('I agree'), 'gate page: the rules, zero tolerance, 24 hours, I agree');
r = await page('/members/you/help/rules', A.session);
ok(r.rendered && r.body.includes('How members treat each other.'), 'help: the rules copy is open before agreeing');
r = await page('/members/you/help', A.session);
ok(r.rendered && r.body.includes('Community rules'), 'help: the index lists Community rules');

// the member cannot set it themselves (no column grant)
const self = await fetch(`${REST}/members?id=eq.${A.id}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${A.session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ rules_agreed_at: new Date().toISOString() }) });
ok(self.status >= 400, `security: a member cannot write rules_agreed_at themselves (${self.status})`);
eq(sql1(`select rules_agreed_at from members where id = ${q(A.id)}`).rules_agreed_at, null, 'security: still not agreed');

// agreeing in a browser goes back to where they were going
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const host = new URL(BASE).hostname;
await ctx.addCookies(cookieFor(A.session).split('; ').map((part) => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), domain: host, path: '/' }; }));
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
await pg.goto(`${BASE}/members/events`, { waitUntil: 'networkidle' });
eq(new URL(pg.url()).pathname, '/members/rules', 'browser: lands on the rules');
ok(await pg.getByRole('heading', { name: /Community rules/ }).isVisible(), 'browser: the heading');
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'browser: nothing wider than a 390 screen');
await pg.screenshot({ path: '/home/claude/build-review/rules-gate-390.png', fullPage: true });
await pg.getByRole('button', { name: 'I agree' }).click();
await pg.waitForURL((u) => u.pathname === '/members/events', { timeout: 15000 });
ok(true, 'browser: I agree goes on to the page they were going to');
const agreed = sql1(`select rules_agreed_at from members where id = ${q(A.id)}`).rules_agreed_at;
ok(Boolean(agreed), 'browser: the agreement is saved');
r = await page('/members/rules?next=%2Fmembers%2Fplans', A.session);
eq(r.location, '/members/plans', 'agreed: the gate page sends them straight on');
r = await page('/members/open-invite', A.session);
ok(r.rendered, 'agreed: no gate any more');
r = await page('/members/rules?next=https%3A%2F%2Fevil.example%2F', A.session);
ok(r.location && !r.location.includes('evil'), 'next: only a members page on this site');
eq(errors, [], 'browser: no page errors');
await ctx.close();

// order and no loops: no photo and not agreed -> the photo gate first
const B = await makeMember(`rh${rand()}`, 'active', { rules_agreed_at: null });
const Bs = await memberSession(B.email);
r = await page('/members/events', Bs);
ok(r.location?.startsWith('/members/photo'), `order: the photo gate comes first (${r.location})`);
r = await page('/members/photo', Bs);
ok(r.rendered, 'order: the photo page opens (no loop with the rules)');
r = await page('/members/rules', Bs);
ok(r.location?.startsWith('/members/photo'), 'order: the rules page sends a member with no photo to the photo gate');
// paused and not agreed -> the membership gate, which opens
const C = await makeMemberWithPhoto(`ri${rand()}`, 'paused', { rules_agreed_at: null });
r = await page('/members/events', C.session);
eq(r.location, '/members/membership', 'order: a paused member goes to the membership gate');
r = await page('/members/membership', C.session);
ok(r.rendered, 'order: the membership gate opens (no loop with the rules)');
r = await page('/members/rules', C.session);
eq(r.location, '/members/membership', 'order: the rules page sends a paused member to their gate');

// an agreed member (the test default) never sees it
const D = await makeMemberWithPhoto(`rj${rand()}`);
r = await page('/members/open-invite', D.session);
ok(r.rendered, 'agreed member: straight in');
await browser.close();
done();
