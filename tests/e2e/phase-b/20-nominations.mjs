// Nominate a friend and Club Yuppie credit (Albert, 11 to 12 Nov 2026: "Each member will get 5 referrals, each time
// they refer a member if approved their account will be credited with £10"; "it's 5 nominations (doesn't matter if
// they get approved or not)"). On the Phase B server built with NEXT_PUBLIC_MEMBERS_NOMINATIONS=on (server.sh), with
// migration 20261112090000_nominations_credit applied.
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/20-nominations.mjs
import {
  action, adminSession, done, eq, fd, makeMember, makeMemberWithPhoto, memberSession, ok, page, q, rand, sql, sql1, svc,
} from './lib.mjs';

const admin = await adminSession('bf.');
const nominator = await makeMemberWithPhoto('nm');
// digit, letter, digit, letter after the name (13 Nov 2026: never two letters together, so no "STD")
const CODE_RE = /\b(NM)-[2-9][A-HJ-NP-Z][2-9][A-HJ-NP-Z]\b/;
const html = (text) => text.replace(/<!-- -->/g, '').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&');

// ---------------------------------------------------------------- the code and the page
eq(sql1(`select nomination_code, nominations_allowed from members where id = ${q(nominator.id)}`), { nomination_code: null, nominations_allowed: 5 }, 'a new member: no code yet, 5 nominations');
const first = await page('/members/you/nominate', nominator.session);
eq(first.status, 200, 'the Nominate page opens');
const code = sql1(`select nomination_code from members where id = ${q(nominator.id)}`).nomination_code;
ok(CODE_RE.test(code ?? ''), 'its code is made on the first visit: their first name and four characters', code);
const text1 = html(first.text);
ok(text1.includes('Nominate a friend.') && text1.replace(/<[^>]+>/g, '').includes(`/apply/${code.toLowerCase()}`), 'the page shows the link (the site address, then /apply/<code in small letters>)', code);
ok(text1.includes(code) && text1.includes('5 of 5 nominations left.'), 'and the code, and 5 of 5 left');
ok(text1.includes('No one yet.') && text1.includes('£0'), 'no nominations yet, £0 credit');
await page('/members/you/nominate', nominator.session);
eq(sql1(`select nomination_code from members where id = ${q(nominator.id)}`).nomination_code, code, 'the code stays the same on the next visit');
ok(html((await page('/members/you', nominator.session)).text).includes('Nominate a friend'), 'You: the card');
ok(html((await page('/members/you', nominator.session)).text).includes('5 left'), 'You: 5 left');
ok(html((await page('/members/you', nominator.session)).text).includes('£10 credit for you each time one is approved.'), 'You: the card says the deal');
ok(!html((await page('/members/access', nominator.session)).text).includes('Nominate a friend'), 'Access: no card (nominating is on You only, Albert 12 Nov)');

// ---------------------------------------------------------------- checking a code
eq((await action('apply.checkNominationCode', [code.toLowerCase().replace('-', ' ')])).result, { ok: true, firstName: 'Nm' }, 'a code typed in small letters with a space: found');
eq((await action('apply.checkNominationCode', ['NOBODY-2345'])).result, { ok: false, error: 'We don’t recognise that code. Check it, or leave it blank.' }, 'a code nobody has');
eq((await action('apply.checkNominationCode', ['not a code'])).result.ok, false, 'not a code at all');

const apply = await page(`/apply?n=${code}`);
const applyText = html(apply.text);
ok(applyText.includes('Nm nominated you.') && applyText.includes(`value="${code}"`), '/apply?n=: "Nm nominated you." and the code filled in');
ok(!html((await page('/apply?n=NOBODY-2345')).text).includes('nominated you'), '/apply with a code nobody has: nothing said');
const pretty = await page(`/apply/${code.toLowerCase()}`);
eq(pretty.status, 200, 'the new link, /apply/<code>, opens the form (13 Nov 2026)');
ok(html(pretty.text).includes('Nm nominated you.') && pretty.text.includes(`value="${code}"`), '/apply/<code>: "Nm nominated you." and the code filled in, in capitals');
ok(pretty.text.includes('noindex'), '/apply/<code>: kept out of search results');
ok(!html((await page('/apply/nobody-2345')).text).includes('nominated you'), '/apply/<a code nobody has>: the form, nothing said');
const fromApp = await page(`/apply/${code.toLowerCase()}`, null, { 'user-agent': 'Mozilla/5.0 (iPhone) Mobile/15E148 YuppieNativeApp' });
ok(fromApp.status >= 300 && fromApp.status < 400 && /\/member-login/.test(fromApp.location ?? ''), 'in the app, /apply/<code> goes to sign-in as /apply does', fromApp.status);
const og = await fetch(`${process.env.PHASE_B_BASE || 'http://localhost:3241'}/apply/opengraph-image.png`);
eq([og.status, (og.headers.get('content-type') ?? '').startsWith('image/')], [200, true], 'the share image at /apply/opengraph-image.png is still the image, not a code');

// ---------------------------------------------------------------- applying with it
const form = (email, name, extra = {}) =>
  fd({ full_name: name, email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_payment_method_id: `pm_nom_${rand()}`, ...extra });
const applyAs = async (name, extra = {}) => {
  const email = `bf.t-nominee-${rand()}@example.com`;
  const r = await action('apply.submitApplication', [form(email, `${name} Nominee`, extra)]);
  eq(r.result, { success: true }, `${name} applies`);
  return sql1(`select id, nominated_by, status from applications where email = ${q(email)}`);
};
const ann = await applyAs('Ann', { nomination_code: code.toLowerCase() });
eq(ann.nominated_by, nominator.id, 'Ann applied with the code: nominated by the member');
const plain = await applyAs('Plain');
eq(plain.nominated_by, null, 'someone with no code: nominated by nobody');

// Approved: £10 of credit to the nominator, once.
await action('admin.applications.approveApplication', [fd({ id: ann.id })], admin);
eq(sql1(`select status from applications where id = ${q(ann.id)}`).status, 'approved', 'the committee approves Ann');
let ledger = [];
for (let i = 0; i < 20 && !ledger.length; i += 1) {
  ledger = sql(`select amount_pence, kind, application_id, dedupe_key from credit_ledger where member_id = ${q(nominator.id)}`);
  if (!ledger.length) await new Promise((r) => setTimeout(r, 250));
}
eq(ledger, [{ amount_pence: 1000, kind: 'nomination', application_id: ann.id, dedupe_key: `nomination:${ann.id}` }], '£10 of credit to the nominator for Ann');
await action('admin.applications.approveApplication', [fd({ id: ann.id })], admin);
await new Promise((r) => setTimeout(r, 500));
eq(sql(`select id from credit_ledger where member_id = ${q(nominator.id)}`).length, 1, 'approving again adds nothing');

// Declined: the nomination is still used; the nominator sees only "Nomination used".
const cara = await applyAs('Cara', { nomination_code: code });
eq((await action('admin.applications.declineApplication', [cara.id, { sendEmail: false }], admin)).result.ok, true, 'the committee declines Cara');
eq(sql1(`select status from applications where id = ${q(cara.id)}`).status, 'rejected', 'Cara: declined');
eq(sql(`select id from credit_ledger where application_id = ${q(cara.id)}`).length, 0, 'no credit for a declined nominee');
const ben = await applyAs('Ben', { nomination_code: code });

const after = html((await page('/members/you/nominate', nominator.session)).text);
ok(after.includes('2 of 5 nominations left.'), 'three applications with the code: 2 of 5 left, whatever the committee decided');
ok(after.includes('Ann') && after.includes('Approved · Applied'), 'Ann: Approved');
ok(after.includes('Cara') && after.includes('Nomination used'), 'Cara: Nomination used (never "declined")');
ok(!/declined|rejected/i.test(after.replace(/Nomination used/g, '')), 'the page never says declined');
ok(after.includes('Ben') && after.includes('With the committee'), 'Ben: with the committee');
ok(after.includes('£10') && after.includes('Ann’s nomination'), 'the credit, £10, from Ann’s nomination');
ok(html((await page('/members/you', nominator.session)).text).includes('2 of 5 left · £10 credit'), 'You: 2 of 5 left · £10 credit');

// Used up: two more, then the code stops; the database guard drops a nomination over the limit.
await applyAs('Dan', { nomination_code: code });
await applyAs('Eve', { nomination_code: code });
eq((await action('apply.checkNominationCode', [code])).result, { ok: false, error: 'That code has no nominations left. Leave it blank to apply anyway.' }, 'five used: the code says so');
ok(html((await page(`/apply?n=${code}`)).text).includes('This nomination link has been used.'), '/apply?n=: "This nomination link has been used."');
ok(html((await page(`/apply/${code.toLowerCase()}`)).text).includes('This nomination link has been used.'), '/apply/<code>: the same');
const late = await applyAs('Late', { nomination_code: code });
eq(late.nominated_by, null, 'applying with a used-up code anyway: the application goes in, nominated by nobody');
const { data: forced, error: forcedError } = await svc.from('applications').insert({ full_name: 'Forced Nominee', email: `bf.t-forced-${rand()}@example.com`, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', nominated_by: nominator.id }).select('nominated_by').single();
eq([forcedError, forced?.nominated_by], [null, null], 'the database drops a nomination past the limit (two at once)');
ok(html((await page('/members/you/nominate', nominator.session)).text).includes('You’ve used all 5 nominations.'), 'the page: all 5 used, no link');

// ---------------------------------------------------------------- Admin
const card = html((await page(`/admin/applications/${ben.id}`, admin)).text);
ok(card.includes('Nominated by') && card.includes('Nm Tester'), 'Admin, the application: Nominated by, the member');
const memberCard = html((await page(`/admin/members/${nominator.id}`, admin)).text);
ok(memberCard.includes('Nominations and credit') && memberCard.includes('5 of 5 used') && memberCard.includes(code), 'Admin, the member: nominations used and their code');

eq((await action('admin.credit.adminSetNominationsAllowed', [nominator.id, 7], admin)).result, { ok: true, message: 'Saved. They can make 7 nominations.' }, 'Admin gives two more');
eq((await action('apply.checkNominationCode', [code])).result.ok, true, 'the code works again');
eq((await action('admin.credit.adminAdjustCredit', [nominator.id, 250, 'Sorry about the mix-up'], admin)).result, { ok: true, message: 'Added £2.50.' }, 'Admin adds £2.50 with a reason');
eq((await action('admin.credit.adminAdjustCredit', [nominator.id, -100000, 'Too much'], admin)).result, { ok: false, error: 'They only have £12.50 of credit.' }, 'taking off more than they have: refused');
eq((await action('admin.credit.adminAdjustCredit', [nominator.id, 500, '  '], admin)).result, { ok: false, error: 'Add a reason. The member sees it in their credit history.' }, 'no reason: refused');
eq((await action('admin.credit.adminAdjustCredit', [nominator.id, -250, 'Taken back'], admin)).result, { ok: true, message: 'Took off £2.50.' }, 'Admin takes £2.50 off');
const hist = html((await page('/members/you/nominate', nominator.session)).text);
ok(hist.includes('Sorry about the mix-up') && hist.includes('Taken back') && hist.includes('£10'), 'the member sees the reasons, and £10 left');
eq(sql(`select count(*)::int as n from admin_audit where action = 'member.credit' and target_id = ${q(nominator.id)}`)[0].n, 4, 'each credit change is audited (refused ones too)');

// Not an admin: refused.
const notAdmin = await action('admin.credit.adminAdjustCredit', [nominator.id, 1000, 'Me'], nominator.session).catch((e) => ({ error: String(e) }));
ok(notAdmin.redirect || notAdmin.error || notAdmin.result?.ok === false, 'a member cannot add credit', notAdmin);
eq(sql(`select coalesce(sum(amount_pence), 0)::int as p from credit_ledger where member_id = ${q(nominator.id)}`)[0].p, 1000, 'still £10');

// A paused member's code does not count.
const paused = await makeMember('nmp', 'paused');
await svc.from('members').update({ nomination_code: 'NMP-2345' }).eq('id', paused.id);
eq((await action('apply.checkNominationCode', ['NMP-2345'])).result.ok, false, 'a paused member’s code: not recognised');

// A member cannot read the ledger or another member's code.
const nominee = await memberSession(sql1(`select email from applications where id = ${q(ann.id)}`).email).catch(() => null);
if (nominee) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/credit_ledger?select=*`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${nominee.access_token}` } });
  const rows = await r.json().catch(() => null);
  ok(r.status >= 400 || (Array.isArray(rows) && rows.length === 0), 'a member cannot read credit_ledger', r.status);
}

done();
