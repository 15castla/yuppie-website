// Fixer 3 (admin) regression checks for the QA2 findings of the Phase A fix round (FIX_BRIEF.md, 28 Oct 2026).
//   QA2-01  every admin page, layout, route and action refuses no session, an aal1 admin session and a
//           member's session: normal requests, RSC requests (the page alone, the section layout, the whole tree,
//           as a router refresh or a soft navigation asks for them) and every server action in app/admin
//   QA2-02  Delete member is Delete my account (Stripe cancelled, future bookings refunded, anonymised, banned)
//   QA2-03  password reset asks for the authenticator code before the new password (aal2), on the local Auth
//   QA2-04  approve after another admin declined (or approved): refused, nothing charged; the database too
//   QA2-05  a started event is read only on the server
//   QA2-06  "Email them now" stays until the email has gone (events.change_emailed_at)
//   QA2-07  the approve preview has the Renews line, the rest word for word as sent
//   QA2-08  a card Stripe won't detach: Try again, the club alerted, the email leaves the line out
//   QA2-09  loading: shapes after about 300 ms, main aria-busy meanwhile
//   QA2-10  the CSV phone column has no guard apostrophe
//   QA2-11  Menu keeps the keyboard, Escape returns it to Menu; Change membership focuses the choice
//   QA2-12  the open row is marked even past the first nine
//   QA2-13  a stale Resume says what happened; no "Something went wrong" on these screens
//   QA2-14  "Applications, all time" opens every application
// Run against a production build of this branch: PHASE_A_BASE=http://localhost:3153 node tests/e2e/phase-a/13-fixes-3.mjs
// Test people are prefixed f3. (emails f3.t-…@example.com); the admins are f3.admin and f3r.admin (reset).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin, sessionFromCookies, jwtClaims } from '/home/claude/stack/tools/login-admin.mjs';
import { freshTotp } from '/home/claude/stack/tools/totp.mjs';
import { action, adminSession, cookieFor, done, eq, exec, fakePay, fakesMark, fakesSince, fakeState, memberSession, messages, ok, q, rand, sleep, sql, sql1, stripe, svc, waitFor, ALERTS, ANON, BASE, SUPA } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const RUN = rand();
const MARK = `F3x${RUN}`; // in every name this script makes: a reply that holds it has leaked data
const since = new Date().toISOString();
for (const prefix of ['f3.', 'f3r.']) execFileSync(process.execPath, ['/home/claude/stack/tools/seed.mjs', '--prefix', prefix, '--quiet'], { stdio: 'ignore', timeout: 300000 });
const ADMIN = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-f3.json', 'utf8'));
const ADMIN_R = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-f3r.json', 'utf8'));
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&zwnj;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- f3. people, applications, events
async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data.nextPage) return null;
  }
}
async function member(name, fields = {}) {
  const email = `f3.t-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${rand()}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
  const user = error ? await findUser(email) : data.user;
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  const row = { id: user.id, email, full_name: name, phone: '+447700900123', membership_status: 'active', stripe_customer_id: c.json.id, stripe_subscription_id: s.json.id, ...fields };
  const up = await svc.from('members').upsert(row);
  if (up.error) throw up.error;
  return { id: user.id, email, name, first: name.split(' ')[0], customer: c.json.id, subscription: s.json.id };
}
async function application(name, { pm = `pm_f3_${rand()}`, phone = '+447700900777' } = {}) {
  const email = `f3.t-app-${rand()}@example.com`;
  const c = await stripe('POST', 'customers', { email, name });
  const { data, error } = await svc.from('applications').insert({
    full_name: name, email, phone, employer: 'Example Ltd', role_title: 'Analyst', linkedin_url: 'https://www.linkedin.com/in/example', instagram_username: 'example',
    stripe_customer_id: c.json.id, stripe_payment_method_id: pm,
  }).select('id').single();
  if (error) throw error;
  return { id: data.id, email, pm, name, first: name.split(' ')[0], customer: c.json.id };
}
async function event(name, { price = 0, hours = 24 * 12, capacity = 20 } = {}) {
  const { data, error } = await svc.from('events').insert({
    slug: `f3-t-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${rand()}`, title: name, description: 'Fixer 3 test event', category: 'sport', location: `${name} Hall`,
    start_time: new Date(Date.now() + hours * 3600000).toISOString(), price_pence: price, capacity, image_url: 'https://example.com/f3.png',
  }).select('id, slug, title').single();
  if (error) throw error;
  await svc.from('event_addresses').upsert({ event_id: data.id, address: `${name} Hall, 1 Sample Road, Anytown AB1 2CD` });
  return { ...data, price };
}
async function paidBooking(m, ev) {
  const r = await stripe('POST', 'payment_intents', { amount: ev.price, currency: 'gbp', customer: m.customer, metadata: { member_id: m.id, event_id: ev.id } });
  await fakePay(r.json.id, 'http://127.0.0.1:9/none');
  const { data, error } = await svc.from('bookings').insert({ member_id: m.id, event_id: ev.id, status: 'confirmed', amount_pence: ev.price, stripe_payment_intent_id: r.json.id, booked_at: new Date(Date.now() - 86400000).toISOString() }).select('id').single();
  if (error) throw error;
  return { id: data.id, pi: r.json.id };
}
const localIn = (days, hh, mm) => {
  const d = new Date(Date.now() + days * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- sessions: none, aal1 admin, a member (aal1), aal2 admin
async function passwordSession(email, password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const json = await r.json();
  if (r.status !== 200) throw new Error(`password login: ${JSON.stringify(json)}`);
  return json;
}
const aal1Session = await passwordSession(ADMIN.email, 'local-admin-password-1');
eq(jwtClaims(aal1Session.access_token).aal, 'aal1', 'an admin with the password only has an aal1 session');
const aal2Session = await adminSession('f3.');
const REFUSED = [['no session', ''], ['admin aal1', cookieFor(aal1Session)]];

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
async function adminPage(width = 1280, prefix = 'f3.') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await loginAdmin(page, BASE, adminCreds(prefix));
  return { context, page };
}
const { page } = await adminPage();
async function open(p, pg = page) {
  await pg.goto(`${BASE}${p}`, { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => Object.keys(b).some((k) => k.startsWith('__react'))), null, { timeout: 30000 });
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const copyFound = [];
async function copyCheck(label, scope) {
  const t = await scope.innerText();
  for (const line of t.split('\n')) {
    if (/Something went wrong/i.test(line) || /\bPlease\b/.test(line) || (/[A-Za-z]'[A-Za-z]/.test(line) && !/@|King's/.test(line))) copyFound.push(`${label}: ${line.trim()}`);
  }
}

try {
  // ======================================================================================== QA2-01
  // Something on every admin page that a refused reply must not carry.
  const leakMember = await member(`${MARK} Leakmember`);
  const leakBooker = await member(`${MARK} Leakbooker`);
  const leakEvent = await event(`${MARK} Leak night`, { price: 1500 });
  await paidBooking(leakBooker, leakEvent);
  const leakApp = await application(`${MARK} Leakapplicant`);
  const { data: perk } = await svc.from('partner_perks').insert({ name: `${MARK} Leak perk`, area: 'Anytown', category: 'Food & Drink', type: 'discount', headline: '10% off', badge: '10%', display_order: 9000 }).select('id').single();
  const { data: door } = await svc.from('partner_perks').insert({ name: `${MARK} Leak door`, area: 'Anytown', type: 'access', access_kind: 'skip_queue', headline: 'In first', display_order: 9000 }).select('id').single();
  const memberCookie = cookieFor(await memberSession(leakMember.email));
  const pages = [
    ['/admin', /ad-glance/],
    ['/admin/applications', /ad-card/],
    ['/admin/applications?tab=all', /ad-card/],
    [`/admin/applications/${leakApp.id}`, MARK],
    ['/admin/members', /ad-card/],
    [`/admin/members/${leakMember.id}`, MARK],
    ['/admin/events', /ad-card/],
    ['/admin/events?list=past', /ad-card/],
    [`/admin/events/${leakEvent.id}`, MARK],
    [`/admin/events/${leakEvent.id}?tab=attendees`, MARK],
    ['/admin/events/new', /New event/],
    ['/admin/discounts', /ad-card/],
    [`/admin/discounts/${perk.id}`, MARK],
    ['/admin/discounts/new', /ad-card/],
    ['/admin/access', /ad-card/],
    [`/admin/access/${door.id}`, MARK],
    ['/admin/access/feature', /Feature card/],
  ];
  // Data, not the static loading shapes a refused reply may carry before its redirect: the names this script
  // made, any member's or admin's email, the dashboard's numbers, the bar with who is logged in.
  const leaks = (body) => body.includes(MARK) || /@example\.com|ad-glance|At a glance|Coming up|Logged in as/.test(body);
  const toLogin = (r) => (r.status === 307 && /\/admin\/login$/.test(new URL(r.location ?? '/', BASE).pathname)) || /NEXT_REDIRECT;(replace|push);\/admin\/login;/.test(r.body);
  const toHome = (r) => (r.status === 307 && new URL(r.location ?? '/x', BASE).pathname === '/') || /NEXT_REDIRECT;(replace|push);\/;/.test(r.body);
  async function get(p, cookie, headers = {}) {
    let r = await fetch(`${BASE}${p}`, { redirect: 'manual', headers: { ...headers, Cookie: cookie } });
    // RSC requests carry a cache-busting _rsc parameter worked out from the headers: the server sends us to it.
    if (headers.RSC && r.status === 307 && /_rsc=/.test(r.headers.get('location') ?? '')) r = await fetch(new URL(r.headers.get('location'), BASE), { redirect: 'manual', headers: { ...headers, Cookie: cookie } });
    return { status: r.status, location: r.headers.get('location'), body: await r.text() };
  }
  // Normal requests.
  for (const [p] of pages) {
    for (const [label, cookie] of REFUSED) {
      const r = await get(p, cookie);
      ok(toLogin(r) && !leaks(r.body), `QA2-01 ${p}, ${label}: sent to Log in, nothing of the page (${r.status})`, { status: r.status, location: r.location, body: r.body.slice(0, 300) });
    }
    const m = await get(p, memberCookie);
    ok(toHome(m) && !leaks(m.body), `QA2-01 ${p}, a member’s session: sent home, nothing of the page`, { status: m.status, location: m.location });
  }
  // RSC requests, as the router makes them: capture the page's own tree from a real router refresh, then ask
  // for the page alone (its layouts claimed to be on screen already: the QA2 leak), from the section's layout
  // down, and the whole tree.
  const trees = [];
  for (const [p, marker] of pages) {
    await open(p);
    const req = page.waitForRequest((r) => Boolean(r.headers().rsc) && !r.headers()['next-router-prefetch'] && r.url().startsWith(`${BASE}${p.split('?')[0]}`));
    await page.evaluate(() => window.next.router.refresh());
    const h = (await req).headers();
    trees.push({ p, marker, tree: JSON.parse(decodeURIComponent(h['next-router-state-tree'])) });
  }
  function variant(tree, depth) {
    // Each node: [segment, { children: node }, url, refresh marker, flags]. depth -1 = the page itself.
    const copy = JSON.parse(JSON.stringify(tree));
    const chain = [];
    for (let node = copy; node; node = node[1]?.children) chain.push(node);
    for (const node of chain) node[3] = null;
    chain[depth < 0 ? chain.length + depth : depth][3] = 'refetch';
    return copy;
  }
  let rscChecks = 0;
  for (const { p, marker, tree } of trees) {
    const forms = { 'the page alone': variant(tree, -1), 'from the section layout': variant(tree, Math.min(3, (() => { let n = 0; for (let x = tree; x; x = x[1]?.children) n += 1; return n - 1; })())), 'the whole tree': variant(tree, 0) };
    for (const [form, t] of Object.entries(forms)) {
      const headers = { RSC: '1', 'Next-Router-State-Tree': encodeURIComponent(JSON.stringify(t)), 'Next-Url': '/admin/members' };
      for (const [label, cookie] of REFUSED) {
        const r = await get(p, cookie, headers);
        ok(toLogin(r) && !leaks(r.body), `QA2-01 RSC ${p} (${form}), ${label}: refused, nothing of the page`, { status: r.status, body: r.body.slice(0, 400) });
        rscChecks += 1;
      }
      const m = await get(p, memberCookie, headers);
      ok(toHome(m) && !leaks(m.body), `QA2-01 RSC ${p} (${form}), a member’s session: refused`, { status: m.status, body: m.body.slice(0, 300) });
    }
    // The control: the same "page alone" request with the aal2 cookie does carry the page.
    const c = await get(p, cookieFor(aal2Session), { RSC: '1', 'Next-Router-State-Tree': encodeURIComponent(JSON.stringify(forms['the page alone'])), 'Next-Url': '/admin/members' });
    ok(c.status === 200 && (typeof marker === 'string' ? c.body.includes(marker) : marker.test(c.body)), `QA2-01 RSC ${p} (the page alone), aal2: the same request carries the page (the check above is real)`);
  }
  ok(rscChecks === trees.length * 6, `${rscChecks} RSC requests refused`);
  // The route handler.
  const csvPath = `/api/admin/events/${leakEvent.id}/attendees`;
  for (const [label, cookie] of REFUSED) {
    const r = await get(csvPath, cookie);
    ok(toLogin(r) && !leaks(r.body), `QA2-01 GET ${csvPath}, ${label}: sent to Log in, no list`);
  }
  const csvOk = await get(csvPath, cookieFor(aal2Session));
  ok(csvOk.status === 200 && csvOk.body.includes(`${MARK} Leakbooker`), 'QA2-01 the route with the aal2 cookie: the list (control)');

  // Every server action in app/admin, from the build's own manifest, refused before it does anything.
  const manifestFile = [`${ROOT}/.next/server/server-reference-manifest.json`, `${ROOT}/.next/dev/server/server-reference-manifest.json`].find((f) => fs.existsSync(f));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).node;
  const adminActions = Object.entries(manifest)
    .map(([id, v]) => ({ id, name: v.exportedName, file: v.filename, worker: Object.keys(v.workers).find((w) => w.startsWith('app/admin')) ?? Object.keys(v.workers)[0] }))
    // Only an action some admin page's client code can call is reachable as an action at all.
    .filter((a) => /^app\/admin\/[^/]+\.ts$/.test(a.file) && a.name !== 'signOut' && a.worker?.startsWith('app/admin'));
  ok(adminActions.length >= 20, `QA2-01 ${adminActions.length} server actions in app/admin are reachable from the admin pages`, adminActions.map((a) => a.name));
  const fdOf = (fields) => ({ fd: fields });
  const E = leakEvent.id;
  const NO_ROW = '00000000-0000-4000-8000-000000000000';
  const ARGS = {
    approveApplication: fdOf({ id: leakApp.id }),
    adminApproveApplication: [leakApp.id],
    declineApplication: [leakApp.id, { sendEmail: true }],
    adminReleaseApplicationCard: [leakApp.id],
    rejectApplication: fdOf({ id: leakApp.id }),
    createPerk: fdOf({ name: `${MARK} new perk`, area: 'Anytown', type: 'discount', category: 'Food & Drink', headline: 'h', badge: 'b' }),
    updatePerk: fdOf({ id: perk.id, name: 'Changed', area: 'Anytown', type: 'discount', category: 'Food & Drink', headline: 'h' }),
    uploadPerkLogo: fdOf({ id: perk.id }),
    removePerkLogo: [perk.id],
    reorderPerks: ['discount', [perk.id]],
    deletePerk: fdOf({ id: perk.id }),
    movePerk: [perk.id, 'up'],
    setFeatureCard: fdOf({ content_type: 'event', content_id: E, label: 'x' }),
    createEvent: fdOf({ title: `${MARK} new event`, category: 'sport', start_time: localIn(20, 18, 30), capacity: '5', price_pounds: '0' }),
    updateEventDetails: fdOf({ event_id: E, title: 'Changed', category: 'sport', start_time: localIn(20, 18, 30), capacity: '5', price_pounds: '0' }),
    updateEventImage: fdOf({ event_id: E }),
    removeEventImage: [E],
    adminCancelEvent: [E, { note: null }],
    adminEmailEventChange: [E],
    adminGetAttendees: [E],
    adminExportAttendees: [E],
    adminGetEventAddress: [E],
    adminPauseMember: [leakMember.id, { stripe: true }],
    adminResumeMember: [leakMember.id, { stripe: true }],
    adminCancelMemberNow: [leakMember.id, { stripe: true }],
    deleteMember: [leakMember.id],
    // Stage 2: the Reports and Photos queues (app/admin/reports-actions.ts, photos-actions.ts). Refused before they
    // read anything, so an id that matches nothing is enough here; tests/e2e/phase-b/13-admin.mjs aims them at real
    // reports and photos and checks nothing changed.
    adminGetReports: ['open'],
    adminGetReport: [NO_ROW],
    adminOpenReportCount: [],
    adminDismissReport: [NO_ROW],
    adminRemoveReportedMessage: [NO_ROW],
    adminRemoveReportedPlan: [NO_ROW, 'x'],
    adminRemoveReportedPhoto: [NO_ROW, 'not_clear'],
    adminWarnReportedMember: [NO_ROW],
    adminSuspendReportedMember: [NO_ROW, { stripe: true }],
    adminGetPhotos: ['check'],
    adminPhotosToCheck: [],
    adminPhotoRemovalReasons: [],
    adminKeepPhoto: [NO_ROW],
    adminRemovePhoto: [NO_ROW, 'not_clear'],
  };
  const unknown = adminActions.filter((a) => !ARGS[a.name]).map((a) => a.name);
  eq(unknown, [], `QA2-01 every server action in app/admin (${adminActions.length}) has a call in this check`);
  const urlOf = (worker) => worker.replace(/^app/, '').replace(/\/\([^)]+\)/g, '').replace(/\/page$/, '').replace(/\[[^\]]+\]/g, 'x') || '/';
  async function callAction(a, cookie, args = ARGS[a.name]) {
    let body;
    const headers = { 'Next-Action': a.id, Accept: 'text/x-component', Cookie: cookie, Origin: BASE };
    if (args.fd) {
      body = new FormData();
      for (const [k, v] of Object.entries(args.fd)) body.set(`_1_${k}`, v);
      body.set('0', '["$K1"]');
    } else {
      body = JSON.stringify(args);
      headers['Content-Type'] = 'text/plain;charset=UTF-8';
    }
    const r = await fetch(`${BASE}${urlOf(a.worker)}`, { method: 'POST', redirect: 'manual', headers, body });
    return { status: r.status, redirect: r.headers.get('x-action-redirect') ?? r.headers.get('location'), body: await r.text() };
  }
  const snapshot = () => sql1(`select
    (select row_to_json(m) from (select membership_status, paused_at, ended_at, deleted_at, full_name from members where id = ${q(leakMember.id)}) m) as member,
    (select row_to_json(e) from (select title, cancelled_at, image_url, changed_at, change_emailed_at from events where id = ${q(E)}) e) as event,
    (select json_agg(b.status) from bookings b where b.event_id = ${q(E)}) as bookings,
    (select row_to_json(a) from (select status, card_released_at, stripe_subscription_id from applications where id = ${q(leakApp.id)}) a) as application,
    (select row_to_json(p) from (select name, display_order, logo_url from partner_perks where id = ${q(perk.id)}) p) as perk,
    (select count(*) from partner_perks where name like ${q(`${MARK}%`)}) as perks,
    (select count(*) from events where title like ${q(`${MARK}%`)}) as events,
    (select row_to_json(f) from (select content_type, content_id, label from feature_card) f) as feature,
    (select count(*) from admin_audit where created_at >= ${q(since)} and (target_id in (${[leakMember.id, E, leakApp.id, perk.id].map(q).join(',')}) or action like 'feature%'))::int as audits`);
  const before = snapshot();
  const stripeMark = fakesMark();
  for (const a of adminActions) {
    for (const [label, cookie] of REFUSED) {
      const r = await callAction(a, cookie);
      ok(/^\/admin\/login/.test(r.redirect ?? '') && !leaks(r.body), `QA2-01 action ${a.name}, ${label}: refused (sent to Log in), nothing returned`, { status: r.status, redirect: r.redirect, body: r.body.slice(0, 300) });
    }
    const m = await callAction(a, memberCookie);
    ok(/^\/(;|$)/.test(m.redirect ?? '') && !leaks(m.body), `QA2-01 action ${a.name}, a member’s session: refused (sent home)`, { status: m.status, redirect: m.redirect });
  }
  eq(snapshot(), before, 'QA2-01 after every refused call: the member, event, bookings, application, discount, feature card and audit are exactly as before');
  eq(fakesSince(stripeMark, 'stripe').filter((l) => l.method !== 'GET').length, 0, 'QA2-01 and nothing was written to Stripe');
  // Control: the same call with the aal2 session goes through (the refusals above are the guard, not a bad call).
  const ctl = await callAction(adminActions.find((a) => a.name === 'adminGetEventAddress'), cookieFor(aal2Session));
  ok(!ctl.redirect && ctl.body.includes(`${MARK} Leak night Hall, 1 Sample Road`), 'QA2-01 adminGetEventAddress with the aal2 cookie answers (control)');

  // ======================================================================================== QA2-04
  const rpcApp = await application(`${MARK} Rpc Declined`);
  exec(`update applications set status = 'rejected', stripe_subscription_id = 'sub_f3_${RUN}' where id = ${q(rpcApp.id)}`);
  const rpc = await svc.rpc('approve_application_and_create_member', { p_application_id: rpcApp.id, p_auth_user_id: leakMember.id, p_reviewed_by: 'f3' });
  ok(rpc.error && /not waiting/.test(rpc.error.message), 'QA2-04 the database function refuses a declined application', rpc.error);
  const fnGrants = sql(`select grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'approve_application_and_create_member'`).map((r) => r.grantee);
  ok(fnGrants.includes('service_role') && !fnGrants.some((g) => ['anon', 'authenticated', 'PUBLIC'].includes(g)), 'QA2-04 and it is still service role only', fnGrants);

  const staleD = await application(`${MARK} Stale Declined`);
  await open(`/admin/applications/${staleD.id}`);
  await action('admin.applications.declineApplication', [staleD.id, { sendEmail: false }], aal2Session);
  let mark = fakesMark();
  await button('Approve').click();
  await button(`Approve ${staleD.first}`, page.getByTestId('dialog-approve')).click();
  await page.waitForURL(/done=was-declined/, { timeout: 30000 });
  await page.getByText(`${staleD.first}’s application was declined already.`).waitFor();
  ok(await page.getByText('Nothing was charged and no account was made.').isVisible(), 'QA2-04 approve on a page left open after a decline: “… was declined already. Nothing was charged and no account was made.”');
  eq(sql1(`select a.status, a.stripe_subscription_id, (select count(*)::int from members m where m.email = a.email) as members from applications a where a.id = ${q(staleD.id)}`), { status: 'rejected', stripe_subscription_id: null, members: 0 }, 'QA2-04 still declined, not charged, no member');
  eq(fakesSince(mark, 'stripe').filter((l) => l.method === 'POST' && l.path === '/v1/subscriptions').length, 0, 'QA2-04 no subscription made in Stripe');
  ok(sql(`select 1 from admin_audit where action = 'application.approve_refused' and target_id = ${q(staleD.id)}`).length === 1, 'QA2-04 audit: application.approve_refused');

  const staleA = await application(`${MARK} Stale Approved`);
  await open(`/admin/applications/${staleA.id}`);
  await action('admin.applications.adminApproveApplication', [staleA.id], aal2Session);
  mark = fakesMark();
  await button('Decline').click();
  await button('Decline application', page.getByTestId('dialog-decline')).click();
  await page.waitForURL(/done=was-approved/, { timeout: 30000 });
  await page.getByText(`${staleA.first} was approved already.`).waitFor();
  ok(true, 'QA2-04 decline on a page left open after an approval: “… was approved already.”');
  eq(sql1(`select status from applications where id = ${q(staleA.id)}`).status, 'approved', 'QA2-04 still approved');
  const again = await action('admin.applications.adminApproveApplication', [staleA.id], aal2Session);
  eq([again.result.ok, again.result.code], [false, 'approved'], 'QA2-04 approving it again is refused ("approved"), no second charge');
  eq(fakesSince(mark, 'stripe').filter((l) => l.method === 'POST' && l.path === '/v1/subscriptions').length, 0, 'QA2-04 one subscription only');

  // ---- QA2-04, second round: Approve and Decline pressed at the same moment, by two admins, many times. Each
  // claims the application first (claim_application, migration 20261028090300); the loser changes nothing.
  const approveAct = adminActions.find((a) => a.name === 'adminApproveApplication');
  const declineAct = adminActions.find((a) => a.name === 'declineApplication');
  const cookieA = cookieFor(aal2Session);
  const cookieB = cookieFor(await adminSession('f3r.'));
  const resultOf = (r) => { const line = r.body.split('\n').find((l) => l.startsWith('1:')); try { return JSON.parse(line.slice(2)); } catch { return null; } };
  const tally = { approved: 0, declined: 0, busy: 0 };
  const bad = [];
  const raced = [];
  const raceMark = fakesMark();
  for (let i = 0; i < 12; i += 1) {
    const app = await application(`${MARK} Race ${i}`);
    const calls = [() => callAction(approveAct, cookieA, [app.id]), () => callAction(declineAct, cookieB, [app.id, { sendEmail: true }])];
    if (i % 2) calls.reverse();
    const [r1, r2] = await Promise.all(calls.map((c) => c()));
    const [ra, rd] = i % 2 ? [resultOf(r2), resultOf(r1)] : [resultOf(r1), resultOf(r2)];
    raced.push({ app, ra, rd });
    if (ra?.code === 'busy' || rd?.code === 'busy') tally.busy += 1;
  }
  await sleep(3000); // the approval email and text go after the response
  for (const { app, ra, rd } of raced) {
    const row = sql1(`select a.status, a.stripe_subscription_id, a.processing_at, a.card_released_at is not null as released, (select count(*)::int from members m where m.email = a.email) as members from applications a where a.id = ${q(app.id)}`);
    const subs = fakesSince(raceMark, 'stripe').filter((l) => l.method === 'POST' && l.path === '/v1/subscriptions' && (l.idem ?? '').startsWith(`approve-sub-${app.id}`)).length;
    const mails = messages(`application_id = ${q(app.id)} and template in ('approval', 'decline')`).map((m) => m.template);
    const approvedOk = row.status === 'approved' && row.stripe_subscription_id && row.members === 1 && subs === 1 && ra?.ok === true && rd?.ok === false && !mails.includes('decline');
    const declinedOk = row.status === 'rejected' && !row.stripe_subscription_id && row.members === 0 && subs === 0 && rd?.ok === true && ra?.ok === false && !mails.includes('approval') && row.released;
    if (approvedOk) tally.approved += 1;
    else if (declinedOk) tally.declined += 1;
    else bad.push({ row, subs, mails, ra, rd });
    if (row.processing_at) bad.push({ claimLeft: app.id });
  }
  eq(bad, [], `QA2-04 Approve and Decline at the same moment, 12 times (both orders): each ends approved (charged once, a member, no decline email) or declined (never charged, no member, card released, no welcome) — ${tally.approved} approved, ${tally.declined} declined, ${tally.busy} refused as busy; no claim left behind`);
  ok(tally.busy >= 1, `QA2-04 the two really overlapped (${tally.busy} of 12 refused “… right now, so nothing changed.”)`);
  const busyWords = raced.map(({ ra, rd }) => [ra, rd].find((r) => r?.code === 'busy')?.error).find(Boolean);
  ok(/is (approving|declining) this application right now, so nothing changed\. If it doesn’t finish, try again in two minutes\./.test(busyWords ?? ''), 'QA2-04 the loser’s message is plain', busyWords);
  // A claim left by an action that died: fresh, it blocks; older than two minutes, it is taken over.
  const held = await application(`${MARK} Held Claim`);
  exec(`update applications set processing_at = now(), processing_by = 'f3.someone@example.com', processing_action = 'approve', processing_token = gen_random_uuid() where id = ${q(held.id)}`);
  const blocked = await action('admin.applications.declineApplication', [held.id, { sendEmail: false }], aal2Session);
  eq([blocked.result.ok, blocked.result.code, sql1(`select status from applications where id = ${q(held.id)}`).status], [false, 'busy', 'pending'], 'QA2-04 a fresh claim (another admin approving): Decline is refused, nothing changes');
  ok(blocked.result.error.startsWith('f3.someone@example.com is approving this application right now'), 'QA2-04 and it says who is approving', blocked.result.error);
  exec(`update applications set processing_at = now() - interval '3 minutes' where id = ${q(held.id)}`);
  const taken = await action('admin.applications.declineApplication', [held.id, { sendEmail: false }], aal2Session);
  eq([taken.result.ok, sql1(`select status, processing_at from applications where id = ${q(held.id)}`)], [true, { status: 'rejected', processing_at: null }], 'QA2-04 a claim older than two minutes (an action that died) is taken over, and released after');
  // QA2-15: an application declined after its first payment (a leftover of the old race): never "Nothing was charged".
  const leftover = await application(`${MARK} Charged Declined`);
  exec(`update applications set status = 'rejected', reviewed_at = now(), stripe_subscription_id = 'sub_f3_left_${RUN}' where id = ${q(leftover.id)}`);
  const late = await action('admin.applications.adminApproveApplication', [leftover.id], aal2Session);
  eq([late.result.code, late.result.error], ['declined', 'This application is declined, but its first payment was taken. Refund it in Stripe.'], 'QA2-15 approving it: “… declined, but its first payment was taken. Refund it in Stripe.”');
  await open(`/admin/applications/${leftover.id}?done=was-declined`);
  const leftText = await page.locator('.ad-card').innerText();
  ok(!/nothing (was|is) charged/i.test(leftText) && leftText.includes('No account was made.') && leftText.includes('was charged, but the application is declined.'), 'QA2-15 its card never says “Nothing was charged”: “No account was made.” and the charged banner', leftText);

  // ======================================================================================== QA2-07
  const ap = await application(`${MARK} Preview Person`);
  await open(`/admin/applications/${ap.id}`);
  await button('Approve').click();
  const dlgA = page.getByTestId('dialog-approve');
  await button('Read the email', dlgA).click();
  const previewHtml = await dlgA.locator('iframe').getAttribute('srcdoc');
  const addMonth = (d) => { const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1; const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes())); };
  const fmt = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');
  const stripeRule = fmt(addMonth(new Date()));
  ok(text(previewHtml).includes(`Renews ${stripeRule}`) && text(previewHtml).includes('Paid £10, taken today'), `QA2-07 the approve preview has “Paid £10, taken today” and “Renews ${stripeRule}” (one month on, as Stripe bills)`);
  await button(`Approve ${ap.first}`, dlgA).click();
  await page.waitForURL(/done=approved/, { timeout: 60000 });
  const sentApproval = await waitFor(async () => (await fakeState()).emails.filter((e) => [].concat(e.to).includes(ap.email) && /welcome/i.test(e.subject ?? '')).pop(), 'QA2-07 the approval email is sent');
  const renews = /Renews (\w{3} \d{1,2} \w{3})/;
  const sentRenews = renews.exec(text(sentApproval.html))?.[1];
  ok(sentRenews, `QA2-07 the email sent has its Renews row (${sentRenews}; the local Stripe fake bills 30 days, live Stripe a calendar month)`);
  eq(text(sentApproval.html).replace(renews, 'Renews DATE'), text(previewHtml).replace(renews, 'Renews DATE'), 'QA2-07 the preview is the email sent, word for word, the date of the Renews row aside');

  // ======================================================================================== QA2-08
  const stuck = await application(`${MARK} Stuck Card`, { pm: `pm_fail_f3_${RUN}` });
  mark = fakesMark();
  await open(`/admin/applications/${stuck.id}`);
  await button('Decline').click();
  const dlgD = page.getByTestId('dialog-decline');
  await button('Read the email', dlgD).click();
  ok(await dlgD.getByText('If Stripe can’t remove the saved card, the email leaves out the line about it.').isVisible(), 'QA2-08 the decline preview says the card line is only there when Stripe removes the card');
  await button('Decline application', dlgD).click();
  await page.waitForURL(/done=declined/, { timeout: 30000 });
  await page.getByText('Stripe didn’t remove the saved card.').waitFor();
  ok(await page.getByText('The decline email left out the line about the card.', { exact: false }).isVisible() && await button('Try again').isVisible(), 'QA2-08 the card says Stripe didn’t remove it, the email left the line out, and offers Try again');
  const declineMail = await waitFor(async () => (await fakeState()).emails.filter((e) => [].concat(e.to).includes(stuck.email) && /application/i.test(e.subject ?? '')).pop(), 'QA2-08 the decline email is sent');
  ok(!/removed the card/i.test(text(declineMail.html)), 'QA2-08 and it does not claim the card was removed');
  await waitFor(() => messages(`template = 'admin-alert' and dedupe_key = ${q(`card-not-released:${stuck.id}`)} and status = 'sent'`).length === 1, 'QA2-08 the club is alerted (admin-alert, once)');
  ok(fakesSince(mark, 'email').some((e) => [].concat(e.to).includes(ALERTS) && e.subject === `Saved card not removed: ${stuck.name}`), `QA2-08 the alert reaches ${ALERTS}: “Saved card not removed: …”`);
  await button('Try again').click();
  await page.getByText('Stripe still didn’t remove it. Remove it in Stripe instead.').waitFor();
  ok(true, 'QA2-08 Try again while Stripe still refuses: “Stripe still didn’t remove it. Remove it in Stripe instead.”');
  exec(`update applications set stripe_payment_method_id = 'pm_f3ok_${RUN}' where id = ${q(stuck.id)}`);
  await button('Try again').click();
  await page.getByText('Removed in Stripe').waitFor();
  ok(await page.getByText('Stripe didn’t remove the saved card.').count() === 0, 'QA2-08 Try again when Stripe agrees: “Removed in Stripe”, the banner goes');
  ok(sql(`select 1 from admin_audit where action = 'application.release_card' and target_id = ${q(stuck.id)}`).length === 2, 'QA2-08 audit: application.release_card for each Try again');
  eq(messages(`application_id = ${q(stuck.id)} and template = 'decline'`).length, 1, 'QA2-08 Try again sends no second email');

  // ======================================================================================== QA2-02 / QA3-06
  const doomed = await member(`${MARK} Doomed Deletee`);
  const doomEvent = await event(`${MARK} Doom night`, { price: 3000 });
  const doomBooking = await paidBooking(doomed, doomEvent);
  mark = fakesMark();
  await open(`/admin/members/${doomed.id}`);
  await copyCheck('member card', page.locator('.ad-card-col'));
  await button('Delete member').click();
  const dlgX = page.getByTestId('dialog-delete-member');
  const dlgXText = await dlgX.innerText();
  ok(dlgXText.includes('the same way as Delete my account') && dlgXText.includes('subscription is cancelled in Stripe now') && dlgXText.includes('one future booking is cancelled, and the £30 paid goes back to the card') && dlgXText.includes('Bookings and payment records are kept'), 'QA2-02 the dialog says what happens: Stripe cancelled, the booking cancelled and £30 refunded, details removed, records kept', dlgXText);
  await copyCheck('delete dialog', dlgX);
  ok(await button('Delete member', dlgX).isDisabled(), 'QA2-02 Delete stays switched off until the name is typed');
  await dlgX.locator('input').fill(doomed.name);
  await button('Delete member', dlgX).click();
  await page.waitForURL((u) => u.pathname === '/admin/members', { timeout: 30000 });
  const gone = sql1(`select full_name, phone, email, membership_status, ended_reason, deleted_at is not null as deleted from members where id = ${q(doomed.id)}`);
  ok(gone && gone.full_name === null && gone.phone === null && /^deleted\+/.test(gone.email) && gone.membership_status === 'cancelled' && gone.ended_reason === 'account_deleted' && gone.deleted, 'QA2-02 the member row is kept and anonymised (not a hard delete): cancelled, account_deleted', gone);
  eq(sql1(`select status, cancel_reason, refund_status, refund_pence from bookings where id = ${q(doomBooking.id)}`), { status: 'cancelled', cancel_reason: 'account_deleted', refund_status: 'succeeded', refund_pence: 3000 }, 'QA2-02 the future paid booking survives, cancelled and refunded (it used to cascade away)');
  ok(fakesSince(mark, 'stripe').some((l) => l.method === 'DELETE' && l.path === `/v1/subscriptions/${doomed.subscription}`), 'QA2-02 Stripe: the subscription cancelled now');
  ok(fakesSince(mark, 'stripe').some((l) => l.path === '/v1/refunds' && l.idem === `refund-booking-${doomBooking.id}`), 'QA2-02 Stripe: the booking refunded, with its idempotency key');
  await waitFor(() => messages(`member_id = ${q(doomed.id)} and template = 'account-deleted' and status = 'sent'`).length === 1, 'QA2-02 the account-deleted email to the address they had');
  const { data: au } = await svc.auth.admin.getUserById(doomed.id);
  ok(au?.user && /^deleted\+/.test(au.user.email) && au.user.banned_until, 'QA2-02 the auth user is banned and moved to the tombstone address (login refused)');
  ok(sql(`select 1 from admin_audit where action = 'member.delete' and target_id = ${q(doomed.id)} and admin_id = ${q(ADMIN.userId)}`).length === 1, 'QA2-02 audit: member.delete');
  await open(`/admin/members/${doomed.id}`);
  ok((await page.locator('.ad-card').innerText()).includes('Deleted here by the club.') && await button('Delete member').count() === 0 && await button('Change membership').count() === 0, 'QA2-02 the deleted member’s card: “Deleted here by the club.”, nothing to change or delete');

  // ======================================================================================== QA2-05
  const past = await event(`${MARK} Past night`, { price: 2000, hours: -3 });
  const pastBooker = await member(`${MARK} Past Booker`);
  const pastBooking = await paidBooking(pastBooker, past);
  mark = fakesMark();
  const pc = await action('admin.eventBookings.adminCancelEvent', [past.id, { note: null }], aal2Session);
  eq([pc.result.ok, pc.result.error], [false, 'This event has started, so it can’t be cancelled. Nothing was refunded.'], 'QA2-05 Cancel event on a started event: refused');
  eq(sql1(`select status, refund_status from bookings where id = ${q(pastBooking.id)}`), { status: 'confirmed', refund_status: 'none' }, 'QA2-05 the booking stands, nothing refunded');
  const pe = await action('admin.events.updateEventDetails', [{ $formData: { event_id: past.id, title: 'Edited after it started', category: 'sport', location: 'Elsewhere', address: 'New address', start_time: localIn(20, 18, 30), capacity: '5', price_pounds: '0' } }], aal2Session);
  eq([pe.result.success, pe.result.code], [false, 'locked'], 'QA2-05 editing a started event: refused');
  const pi = await action('admin.events.removeEventImage', [past.id], aal2Session);
  const pu = await action('admin.events.updateEventImage', [{ $formData: { event_id: past.id } }], aal2Session);
  const pm = await action('admin.eventBookings.adminEmailEventChange', [past.id], aal2Session);
  ok(!pi.result.success && !pu.result.success && !pm.result.ok, 'QA2-05 the picture (remove, upload) and Email them now: refused too');
  eq(sql1(`select title, location, cancelled_at, image_url, start_time < now() as started from events where id = ${q(past.id)}`), { title: past.title, location: `${past.title} Hall`, cancelled_at: null, image_url: 'https://example.com/f3.png', started: true }, 'QA2-05 the event is exactly as it was');
  eq(fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds').length + fakesSince(mark, 'email').filter((e) => [].concat(e.to).includes(pastBooker.email)).length, 0, 'QA2-05 no refund, no email');

  // ======================================================================================== QA2-06 and QA2-10
  const moving = await event(`${MARK} Moving night`, { price: 2500 });
  const mover = await member(`${MARK} Mover Person`, { phone: '+447911123456' });
  await paidBooking(mover, moving);
  const abroad = await member(`${MARK} Abroad Person`, { phone: '+33612345678' });
  await paidBooking(abroad, moving);
  await open(`/admin/events/${moving.id}`);
  await page.getByLabel('Location').fill('Riverside Club');
  await button('Save changes').click();
  await page.getByTestId('dialog-move').getByRole('switch').click();
  await button('Save changes', page.getByTestId('dialog-move')).click();
  await page.getByText('Saved. Members see the new details now.').waitFor();
  await open(`/admin/events/${moving.id}`);
  ok(await page.getByText('The 2 people booked haven’t been told about the last change to the date, time or place yet.').isVisible() && await button('Email them now').isVisible(), 'QA2-06 after a reload the offer is still there: “haven’t been told …” and Email them now');
  eq(sql1(`select change_emailed_at from events where id = ${q(moving.id)}`).change_emailed_at, null, 'QA2-06 change_emailed_at is empty: not told');
  await button('Email them now').click();
  await page.getByText('Emailed 2 people about the change.').waitFor();
  await waitFor(() => messages(`event_id = ${q(moving.id)} and template = 'event-changed' and status = 'sent'`).length === 2, 'QA2-06 both people emailed');
  ok(sql1(`select change_emailed_at >= changed_at as told from events where id = ${q(moving.id)}`).told, 'QA2-06 change_emailed_at set, later than changed_at');
  await open(`/admin/events/${moving.id}`);
  eq(await button('Email them now').count(), 0, 'QA2-06 after a reload: no offer once they have been told');
  await page.getByLabel('Starts').fill(localIn(12, 20, 0));
  await button('Save changes').click();
  await button('Save changes', page.getByTestId('dialog-move')).click();
  await page.getByText('Saved. Members see the new details now.').waitFor();
  await waitFor(() => messages(`event_id = ${q(moving.id)} and template = 'event-changed' and status = 'sent'`).length === 4, 'QA2-06 moved again with the email on: both emailed in the save');
  await open(`/admin/events/${moving.id}`);
  eq(await button('Email them now').count(), 0, 'QA2-06 and no offer after it');
  // QA2-10: the CSV.
  const csv = (await get(`/api/admin/events/${moving.id}/attendees`, cookieFor(aal2Session))).body.replace(/^﻿/, '').split('\r\n');
  const moverRow = csv.find((l) => l.includes(mover.email));
  const abroadRow = csv.find((l) => l.includes(abroad.email));
  ok(moverRow.includes(',07911 123456,') && abroadRow.includes(',0033 6 12 34 56 78,') && !csv.some((l) => /,'\+/.test(l)), 'QA2-10 the CSV phone column: “07911 123456”, “0033 6 12 34 56 78”, no guard apostrophe', [moverRow, abroadRow]);

  // ======================================================================================== QA2-13 (a stale Resume) and QA2-11 (Change membership)
  const paused = await member(`${MARK} Paused Person`, { membership_status: 'paused', paused_at: new Date().toISOString() });
  await open(`/admin/members/${paused.id}`);
  await action('admin.memberStatus.adminCancelMemberNow', [paused.id, { stripe: false }], aal2Session);
  await button('Resume membership').click();
  await button('Resume membership', page.getByTestId('dialog-resume')).click();
  await page.getByText(`${paused.first}’s membership was cancelled since this page opened, so it can’t be resumed.`).waitFor();
  ok(await page.getByText('Nothing changed.').isVisible(), 'QA2-13 a stale Resume: “Nothing changed.” and what the membership is now');
  await page.getByText('Cancelled is final.', { exact: false }).waitFor();
  ok(true, 'QA2-13 the card shows the membership as it is now (cancelled)');
  await copyCheck('stale resume', page.locator('.ad-card-col'));
  eq(sql1(`select membership_status from members where id = ${q(paused.id)}`).membership_status, 'cancelled', 'QA2-13 nothing changed: still cancelled');
  ok(sql(`select 1 from admin_audit where action = 'member.resume_refused' and target_id = ${q(paused.id)}`).length === 1, 'QA2-13 audit: member.resume_refused');
  const keyed = await member(`${MARK} Keyed Person`);
  await open(`/admin/members/${keyed.id}`);
  await button('Change membership').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'radio');
  eq(await page.evaluate(() => [document.activeElement.value, document.activeElement.checked]), ['active', true], 'QA2-11 Change membership: the keyboard is on the first choice (Active, chosen)');

  // ======================================================================================== QA2-12 and QA2-14
  const token = `${MARK}Crowd`;
  const crowd = [];
  for (let i = 1; i <= 11; i += 1) crowd.push(await member(`${token} Person${String(i).padStart(2, '0')}`));
  await open(`/admin/members/${crowd[0].id}?q=${encodeURIComponent(token.toLowerCase())}`);
  const current = page.locator('.ad-list-col .ad-item[aria-current="true"]');
  ok(await current.count() === 1 && (await current.getAttribute('href')).includes(crowd[0].id), 'QA2-12 the open member, eleventh of eleven matches, is in the list and marked');
  const appsBefore = sql1('select count(*)::int as n from applications').n;
  await open('/admin');
  eq(await page.locator('.ad-g', { hasText: 'Applications, all time' }).getAttribute('href'), '/admin/applications?tab=all', 'QA2-14 “Applications, all time” links to every application');
  await page.locator('.ad-g', { hasText: 'Applications, all time' }).click();
  await page.waitForURL(/tab=all/);
  await page.locator('.ad-list-col .ad-more').waitFor();
  const listed = Number(/(?:Showing 9 of |^)(\d+)/.exec(await page.locator('.ad-list-col .ad-more').innerText())?.[1]);
  const appsAfter = sql1('select count(*)::int as n from applications').n;
  ok(listed >= appsBefore && listed <= appsAfter, `QA2-14 and the list counts every application (${listed})`);

  // ======================================================================================== QA2-09
  await open('/admin/members');
  eq(await page.evaluate(() => { const s = document.createElement('span'); s.className = 'ad-sk'; document.body.append(s); const cs = getComputedStyle(s); const r = [cs.animationName, cs.animationDuration]; s.remove(); return r; }), ['ad-sk-wait', '0.3s'], 'QA2-09 the shapes wait 0.3 s before they show (ad-sk-wait, as the members area)');
  await page.route(`${BASE}/admin/members/**`, async (route) => {
    const h = route.request().headers();
    if (h.rsc && !h['next-router-prefetch']) await sleep(2500);
    await route.continue();
  });
  const target = page.locator('.ad-list-col .ad-item').nth(1);
  await target.click();
  await sleep(120);
  const early = await page.evaluate(() => ({ busy: document.querySelector('main.ad-main')?.getAttribute('aria-busy'), shape: getComputedStyle(document.querySelector('.ad-card-col .ad-sk') ?? document.body).visibility, has: Boolean(document.querySelector('.ad-card-col .ad-sk')) }));
  await sleep(500);
  const later = await page.evaluate(() => ({ busy: document.querySelector('main.ad-main')?.getAttribute('aria-busy'), shape: getComputedStyle(document.querySelector('.ad-card-col .ad-sk') ?? document.body).visibility }));
  ok(early.has && early.busy === 'true' && early.shape === 'hidden' && later.busy === 'true' && later.shape === 'visible', 'QA2-09 a slow card: main aria-busy at once, the shapes hidden at 0.1 s and shown by 0.6 s', { early, later });
  await page.waitForFunction(() => !document.querySelector('.ad-card-col .ad-sk'), null, { timeout: 30000 });
  eq(await page.evaluate(() => document.querySelector('main.ad-main')?.getAttribute('aria-busy') ?? null), null, 'QA2-09 and main is not busy once the card is there');
  await page.unroute(`${BASE}/admin/members/**`);

  // ======================================================================================== QA2-11 (the Menu at 390)
  const phone = await adminPage(390);
  await open('/admin/members', phone.page);
  const pp = phone.page;
  await pp.locator('.menu-b').focus();
  await pp.keyboard.press('Enter');
  await pp.locator('#ad-menu').waitFor();
  const stops = [];
  for (let i = 0; i < 12; i += 1) {
    await pp.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab');
    stops.push(await pp.evaluate(() => (document.activeElement.closest('#ad-menu') ? 'menu' : document.activeElement.classList.contains('menu-b') ? 'button' : `outside:${document.activeElement.textContent.trim().slice(0, 20)}`)));
  }
  ok(stops.every((s) => s === 'menu' || s === 'button'), 'QA2-11 with the Menu open, Tab and Shift+Tab stay in the panel and its Close button', stops);
  await pp.keyboard.press('Escape');
  await pp.locator('#ad-menu').waitFor({ state: 'detached' });
  eq(await pp.evaluate(() => [document.activeElement.classList.contains('menu-b'), document.activeElement.getAttribute('aria-expanded')]), [true, 'false'], 'QA2-11 Escape closes it and the keyboard is back on Menu');
  await phone.context.close();

  // ======================================================================================== QA2-03
  // Through the real pages: Forgot your password, the link from the email, the code, then the password.
  const rctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rp = await rctx.newPage();
  await rp.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await rp.waitForFunction(() => Object.keys(document.querySelector('input[type="email"]') ?? {}).some((k) => k.startsWith('__react')));
  await rp.fill('input[type=email]', ADMIN_R.email);
  const askedAt = Date.now();
  await rp.getByRole('button', { name: /Forgot/ }).click();
  await rp.getByText('Check your email').waitFor();
  const BOX = '/home/claude/stack/mail/box/new';
  const hash = await waitFor(() => {
    for (const f of fs.readdirSync(BOX)) {
      if (fs.statSync(`${BOX}/${f}`).mtimeMs < askedAt - 1000) continue;
      const t = fs.readFileSync(`${BOX}/${f}`, 'utf8');
      if (!t.toLowerCase().includes(`to: ${ADMIN_R.email}`)) continue;
      const m = t.replace(/=\r?\n/g, '').replace(/=3D/g, '=').match(/token_hash=([0-9a-zA-Z_-]{20,})/);
      if (m) return m[1];
    }
    return null;
  }, 'QA2-03 the reset email arrives with its link', 30000);
  await rp.goto(`${BASE}/admin/reset-confirm?token_hash=${hash}&type=recovery`, { waitUntil: 'networkidle' });
  await rp.getByRole('button', { name: 'Continue' }).click();
  await rp.getByRole('heading', { name: 'Enter your code' }).waitFor();
  ok(await rp.getByText('Enter the 6-digit code from your authenticator app. Then choose a new password.').isVisible(), 'QA2-03 after the link: “Enter your code” first (r2b 13, the Log in page’s step)');
  await copyCheck('reset code step', rp.locator('main'));
  await rp.fill('#reset-code', '000000');
  await rp.getByRole('button', { name: 'Verify code' }).click();
  await rp.getByText('That code is incorrect or has expired. Try again.').waitFor();
  ok(true, 'QA2-03 a wrong code: “That code is incorrect or has expired. Try again.”');
  await rp.fill('#reset-code', await freshTotp(ADMIN_R.secret, 8));
  await rp.getByRole('button', { name: 'Verify code' }).click();
  await rp.locator('#new-password').waitFor();
  eq(jwtClaims((await sessionFromCookies(rctx)).access_token).aal, 'aal2', 'QA2-03 the right code: the session is aal2, then Choose a password');
  const newPassword = `f3-new-password-${RUN}`;
  await rp.fill('#new-password', newPassword);
  await rp.fill('#confirm-password', newPassword);
  await rp.getByRole('button', { name: 'Set password' }).click();
  await rp.waitForURL(/passwordSet=1/, { timeout: 20000 });
  await rp.getByText('Password set. You can log in below.').waitFor();
  ok(true, 'QA2-03 Set password works: “Password set. You can log in below.”');
  const relog = await loginAdmin(rp, BASE, { email: ADMIN_R.email, password: newPassword, secret: ADMIN_R.secret });
  eq(relog.aal, 'aal2', 'QA2-03 and the new password, with the code, logs in (aal2)');
  await rctx.close();
  // The cause, on the local Auth server: a recovery session is aal1, and Auth refuses a new password at aal1.
  const link = await svc.auth.admin.generateLink({ type: 'recovery', email: ADMIN_R.email });
  const verified = await (await fetch(`${SUPA}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'recovery', token_hash: link.data.properties.hashed_token }) })).json();
  const putAal1 = await fetch(`${SUPA}/auth/v1/user`, { method: 'PUT', headers: { apikey: ANON, 'content-type': 'application/json', Authorization: `Bearer ${verified.access_token}` }, body: JSON.stringify({ password: 'f3-never-set-1' }) });
  const putJson = await putAal1.json();
  ok(jwtClaims(verified.access_token).aal === 'aal1' && putAal1.status >= 400 && /aal|AAL/.test(JSON.stringify(putJson)), `QA2-03 the cause: the reset link’s session is aal1 and Auth refuses the password (${putAal1.status} ${putJson.error_code ?? putJson.code ?? ''})`);
  execFileSync(process.execPath, ['/home/claude/stack/tools/seed.mjs', '--prefix', 'f3r.', '--quiet'], { stdio: 'ignore', timeout: 300000 });

  // ======================================================================================== copy on the screens changed here
  eq(copyFound, [], 'QA2-13 no “Something went wrong”, no “Please”, no straight apostrophes on these screens');
  // Tidy: the events this script made stay off the members' Events page; the discount and door go.
  exec(`update events set cancelled_at = now() where title like ${q(`${MARK}%`)} and cancelled_at is null`);
  exec(`delete from partner_perks where name like ${q(`${MARK}%`)}`);
} catch (err) {
  await page.screenshot({ path: '/tmp/13-fixes-3-failure.png', fullPage: true }).catch(() => {});
  console.error(`FAIL 13-fixes-3.mjs: ${err.message}\n  (screenshot /tmp/13-fixes-3-failure.png, page ${page.url()})`);
  process.exit(1);
} finally {
  await browser.close();
}
done();
