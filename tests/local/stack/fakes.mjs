// Local HTTPS fakes for api.stripe.com, api.resend.com and api.twilio.com (test-only, never deployed).
// /etc/hosts points those names at 127.0.0.1; the Next server trusts our CA via NODE_EXTRA_CA_CERTS.
// Every request is appended to logs/fakes.jsonl so tests can assert what the app sent.
// Control endpoints (any host): GET /__fake/state, POST /__fake/reset, POST /__fake/stripe/pay/:pi,
// POST /__fake/stripe/fail/:pi, POST /__fake/stripe/emit {type, object}, POST /__fake/stripe/invoice-failed {subscription}.
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
import querystring from 'node:querystring';

const DIR = '/home/claude/stack';
const LOG = `${DIR}/logs/fakes.jsonl`;
const WEBHOOK_URL = process.env.FAKE_WEBHOOK_URL || 'http://127.0.0.1:3101/api/stripe/webhook';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'local-webhook-secret';

let S;
function reset() {
  S = { customers: {}, setup_intents: {}, payment_intents: {}, refunds: {}, subscriptions: {}, invoices: {}, refund_modes: {}, portal_sessions: {}, accounts: {}, account_links: {}, transfers: {}, events: [], emails: [], sms: [], anthropic: { mode: 'reply', requests: [] }, prices: { price_membership: { id: 'price_membership', object: 'price', unit_amount: 1000, currency: 'gbp', recurring: { interval: 'month' } } } };
}
// Added 28 Oct (fixer 1): membership invoices. A subscription's latest_invoice stays an inline object (the
// shape it always had) and is the same object as S.invoices[id], so GET /v1/invoices/:id, invoices.list and
// invoices.pay see one invoice. A payment method id containing "fail" is declined by invoices.pay.
function makeInvoice(sub, fields = {}) {
  const t = now();
  const inv = { id: id('in'), object: 'invoice', customer: sub.customer, subscription: sub.id, parent: { type: 'subscription_details', subscription_details: { subscription: sub.id } }, status: 'paid', paid: true, amount_due: 1000, amount_paid: 1000, amount_remaining: 0, total: 1000, currency: 'gbp', attempt_count: 1, attempted: true, created: t, payment_intent: null, default_payment_method: null, status_transitions: { finalized_at: t, paid_at: t }, ...fields };
  S.invoices[inv.id] = inv;
  return inv;
}
// "pm_card_mastercard_4444" is a Mastercard ending 4444; any other id is a Visa ending 4242 (as before).
function paymentMethodFor(pmId, customer = null) {
  const m = /^pm_card_([a-z]+)_(\d{4})/.exec(pmId);
  return { id: pmId, object: 'payment_method', type: 'card', customer, card: { brand: m ? m[1] : 'visa', last4: m ? m[2] : '4242' } };
}
reset();
const now = () => Math.floor(Date.now() / 1000);
const id = (p) => `${p}_${crypto.randomBytes(10).toString('hex')}`;
const log = (o) => fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');

// Stripe's form encoding: a[b][c]=1, a[0]=x  -> nested objects
function parseForm(body) {
  const flat = querystring.parse(body);
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    const keys = k.replace(/\]/g, '').split('[');
    let o = out;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) o[key] = v;
      else { o[key] = o[key] ?? (/^\d+$/.test(keys[i + 1]) ? [] : {}); o = o[key]; }
    });
  }
  return out;
}
const list = (arr) => ({ object: 'list', data: arr, has_more: false, url: '' });
const err = (res, code, message, type = 'invalid_request_error') => send(res, code, { error: { message, type } });
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }

function signPayload(payload) {
  const t = now();
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${sig}`;
}
async function emit(type, object, url = WEBHOOK_URL) {
  const ev = { id: id('evt'), object: 'event', type, created: now(), livemode: false, data: { object }, api_version: '2025-01-01' };
  S.events.push(ev);
  const payload = JSON.stringify(ev);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signPayload(payload) }, body: payload });
    log({ kind: 'webhook', type, status: r.status, body: (await r.text()).slice(0, 300) });
    return r.status;
  } catch (e) { log({ kind: 'webhook', type, error: String(e) }); return 0; }
}

function stripeRoute(method, path, body, query) {
  const p = path.replace(/^\/v1\//, '').split('/');
  const [res, rid, sub, subid] = p;
  const coll = { customers: 'customers', setup_intents: 'setup_intents', payment_intents: 'payment_intents', refunds: 'refunds', subscriptions: 'subscriptions', invoices: 'invoices', accounts: 'accounts', transfers: 'transfers' }[res];
  if (res === 'customers' && method === 'POST' && !rid) {
    const c = { id: id('cus'), object: 'customer', created: now(), email: body.email ?? null, name: body.name ?? null, metadata: body.metadata ?? {}, invoice_settings: { default_payment_method: body.invoice_settings?.default_payment_method ?? null } };
    S.customers[c.id] = c; return [200, c];
  }
  if (res === 'setup_intents' && method === 'POST' && !rid) {
    const si = { id: id('seti'), object: 'setup_intent', client_secret: `${id('seti')}_secret_x`, customer: body.customer ?? null, status: 'requires_payment_method', usage: body.usage ?? 'off_session', metadata: body.metadata ?? {}, payment_method: null };
    S.setup_intents[si.id] = si; return [200, si];
  }
  if (res === 'payment_intents' && method === 'POST' && !rid) {
    const pi = { id: id('pi'), object: 'payment_intent', amount: Number(body.amount), amount_received: 0, currency: body.currency, customer: body.customer ?? null, status: 'requires_payment_method', client_secret: null, metadata: body.metadata ?? {}, created: now(), latest_charge: null, capture_method: body.capture_method ?? 'automatic', transfer_data: body.transfer_data ?? null, application_fee_amount: body.application_fee_amount ? Number(body.application_fee_amount) : null, description: body.description ?? null, receipt_email: body.receipt_email ?? null };
    pi.client_secret = `${pi.id}_secret_x`;
    S.payment_intents[pi.id] = pi; return [200, pi];
  }
  if (res === 'payment_intents' && rid && method === 'POST' && sub === 'cancel') { const pi = S.payment_intents[rid]; if (!pi) return [404, null]; pi.status = 'canceled'; return [200, pi]; }
  if (res === 'payment_intents' && rid && method === 'POST' && sub === 'capture') { const pi = S.payment_intents[rid]; if (!pi) return [404, null]; pi.status = 'succeeded'; pi.amount_received = pi.amount; return [200, pi]; }
  if (res === 'refunds' && method === 'POST' && !rid) {
    const pi = S.payment_intents[body.payment_intent];
    if (!pi) return [400, { error: { message: `No such payment_intent: '${body.payment_intent}'`, type: 'invalid_request_error' } }];
    // Added 28 Oct (fixer 1): POST /__fake/stripe/refund-mode {payment_intent, mode} makes refunds for one PI fail.
    const mode = S.refund_modes[pi.id];
    if (mode === 'error500') return [500, { error: { message: 'fake: Stripe had a problem', type: 'api_error' } }];
    if (mode === 'invalid') return [400, { error: { message: 'fake: this charge cannot be refunded', type: 'invalid_request_error', code: 'charge_disputed' } }];
    if (pi.status !== 'succeeded') return [400, { error: { message: 'This PaymentIntent does not have a successful charge to refund.', type: 'invalid_request_error' } }];
    const already = Object.values(S.refunds).filter((r) => r.payment_intent === pi.id).reduce((a, r) => a + r.amount, 0);
    const amount = body.amount ? Number(body.amount) : pi.amount - already;
    if (amount <= 0 || amount + already > pi.amount) return [400, { error: { message: 'Refund amount exceeds charge', type: 'invalid_request_error', code: 'charge_already_refunded' } }];
    const r = { id: id('re'), object: 'refund', amount, currency: pi.currency, payment_intent: pi.id, status: 'succeeded', reason: body.reason ?? null, metadata: body.metadata ?? {}, created: now() };
    S.refunds[r.id] = r; return [200, r];
  }
  if (res === 'refunds' && method === 'GET' && !rid) return [200, list(Object.values(S.refunds).filter((r) => !query.payment_intent || r.payment_intent === query.payment_intent))];
  if (res === 'subscriptions' && method === 'POST' && !rid) {
    const t = now();
    const s = { id: id('sub'), object: 'subscription', customer: body.customer, status: 'active', cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, created: t, current_period_start: t, current_period_end: t + 30 * 86400, metadata: body.metadata ?? {}, pause_collection: null, default_payment_method: body.default_payment_method ?? null, latest_invoice: null, items: { object: 'list', data: [{ id: id('si'), price: S.prices.price_membership, current_period_start: t, current_period_end: t + 30 * 86400 }] } };
    s.latest_invoice = makeInvoice(s);
    S.subscriptions[s.id] = s; return [200, s];
  }
  if (res === 'subscriptions' && rid && method === 'POST' && !sub) {
    const s = S.subscriptions[rid]; if (!s) return [404, null];
    // Added 28 Oct (fixer 1): cancel_at (a moment; '' removes it). Stripe takes one of the two per request.
    if ('cancel_at' in body && 'cancel_at_period_end' in body) return [400, { error: { message: 'You may only specify one of these parameters: cancel_at, cancel_at_period_end.', type: 'invalid_request_error', code: 'parameter_unknown' } }];
    if ('cancel_at' in body) { if (body.cancel_at === '') s.cancel_at = null; else { s.cancel_at = Number(body.cancel_at); s.cancel_at_period_end = false; } }
    if ('cancel_at_period_end' in body) { s.cancel_at_period_end = body.cancel_at_period_end === 'true'; s.cancel_at = s.cancel_at_period_end ? s.items.data[0].current_period_end : null; }
    if ('pause_collection' in body) s.pause_collection = body.pause_collection === '' ? null : body.pause_collection;
    if (body.metadata) s.metadata = { ...s.metadata, ...body.metadata };
    // Added 28 Oct (fixer 1, round 2): '' removes the subscription's own card (as Stripe), a value sets it.
    if ('default_payment_method' in body) s.default_payment_method = body.default_payment_method || null;
    return [200, s];
  }
  if (res === 'subscriptions' && rid && method === 'DELETE') { const s = S.subscriptions[rid]; if (!s) return [404, null]; s.status = 'canceled'; s.canceled_at = now(); s.ended_at = now(); return [200, s]; }
  if (res === 'billing_portal' && rid === 'sessions' && method === 'POST') { const ps = { id: id('bps'), object: 'billing_portal.session', customer: body.customer, return_url: body.return_url ?? null, url: `https://billing.stripe.com/p/session/test_${crypto.randomBytes(6).toString('hex')}`, flow: body.flow_data ?? null }; S.portal_sessions[ps.id] = ps; return [200, ps]; }
  if (res === 'billing_portal' && rid === 'configurations' && method === 'GET') return [200, list([{ id: 'bpc_local', object: 'billing_portal.configuration', active: true, is_default: true }])];
  if (res === 'accounts' && method === 'POST' && !rid) { const a = { id: id('acct'), object: 'account', type: body.type ?? 'express', country: body.country ?? null, business_type: body.business_type ?? null, email: body.email ?? null, charges_enabled: false, payouts_enabled: false, details_submitted: false, metadata: body.metadata ?? {}, capabilities: {}, capabilities_requested: body.capabilities ?? {}, business_profile: body.business_profile ?? null, requirements: { currently_due: ['external_account'] } }; S.accounts[a.id] = a; return [200, a]; }
  // Added 15 Nov (paid Open Invite): an account's bank (listExternalAccounts); POST /__fake/stripe/account/:id sets
  // an account's state (details_submitted, payouts_enabled, capabilities, requirements, bank_last4).
  if (res === 'accounts' && rid && sub === 'external_accounts' && method === 'GET') { const a = S.accounts[rid]; if (!a) return [404, null]; return [200, list(a.bank_last4 ? [{ id: id('ba'), object: 'bank_account', last4: a.bank_last4 }] : [])]; }
  if (res === 'account_links' && method === 'POST') return [200, { object: 'account_link', url: `https://connect.stripe.com/setup/e/test_${crypto.randomBytes(6).toString('hex')}`, expires_at: now() + 300 }];
  if (res === 'accounts' && rid && sub === 'login_links' && method === 'POST') return [200, { object: 'login_link', url: `https://connect.stripe.com/express/test_${crypto.randomBytes(6).toString('hex')}` }];
  if (res === 'transfers' && method === 'POST' && !rid) { const tr = { id: id('tr'), object: 'transfer', amount: Number(body.amount), currency: body.currency, destination: body.destination, metadata: body.metadata ?? {}, transfer_group: body.transfer_group ?? null, source_transaction: body.source_transaction ?? null, created: now(), reversed: false }; S.transfers[tr.id] = tr; return [200, tr]; }
  // Added 27 Oct (foundation agent): card release on decline (C-D8) and card labels. A pm id containing "fail" refuses.
  if (res === 'payment_methods' && rid && sub === 'detach' && method === 'POST') {
    if (rid.includes('fail')) return [400, { error: { message: `The payment method ${rid} could not be detached.`, type: 'invalid_request_error' } }];
    S.detached = S.detached ?? []; S.detached.push(rid);
    return [200, { id: rid, object: 'payment_method', type: 'card', customer: null, card: { brand: 'visa', last4: '4242' } }];
  }
  if (res === 'payment_methods' && rid && method === 'GET' && !sub) return [200, paymentMethodFor(rid)];
  // Added 28 Oct (fixer 1): attach, and membership invoices (list, pay; GET by id is the generic one below).
  if (res === 'payment_methods' && rid && sub === 'attach' && method === 'POST') return [200, paymentMethodFor(rid, body.customer ?? null)];
  if (res === 'invoices' && !rid && method === 'GET') return [200, list(Object.values(S.invoices).filter((i) => (!query.customer || i.customer === query.customer) && (!query.subscription || i.subscription === query.subscription) && (!query.status || i.status === query.status)).sort((a, b) => b.created - a.created))];
  if (res === 'invoices' && rid && sub === 'pay' && method === 'POST') {
    const inv = S.invoices[rid];
    if (!inv) return [404, { error: { message: `No such invoice: '${rid}'`, type: 'invalid_request_error', code: 'resource_missing' } }];
    if (inv.status !== 'open') return [400, { error: { message: `Invoice is already ${inv.status}.`, type: 'invalid_request_error', code: 'invoice_not_open' } }];
    const s = S.subscriptions[inv.subscription];
    const pm = body.payment_method ?? s?.default_payment_method ?? S.customers[inv.customer]?.invoice_settings?.default_payment_method ?? null;
    inv.attempt_count += 1;
    if (!pm || String(pm).includes('fail')) return [402, { error: { message: 'Your card was declined.', type: 'card_error', code: 'card_declined', decline_code: 'generic_decline' } }];
    Object.assign(inv, { status: 'paid', paid: true, amount_paid: inv.amount_due, amount_remaining: 0, default_payment_method: body.payment_method ?? null, status_transitions: { ...inv.status_transitions, paid_at: now() } });
    if (s && s.status === 'past_due') s.status = 'active';
    return [200, inv];
  }
  if (res === 'prices' && rid && method === 'GET') return [200, S.prices[rid] ?? { ...S.prices.price_membership, id: rid }];
  if (coll && rid && method === 'GET' && !sub) { const o = S[coll][rid]; return o ? [200, o] : [404, { error: { message: `No such ${res.replace(/s$/, '')}: '${rid}'`, type: 'invalid_request_error', code: 'resource_missing' } }]; }
  if (coll && rid && method === 'POST' && !sub) { const o = S[coll][rid]; if (!o) return [404, null]; Object.assign(o, body, { metadata: { ...(o.metadata || {}), ...(body.metadata || {}) } }); return [200, o]; }
  if (coll && !rid && method === 'GET') return [200, list(Object.values(S[coll]).filter((o) => !query.customer || o.customer === query.customer))];
  return [501, { error: { message: `fake stripe: ${method} ${path} not implemented`, type: 'api_error' } }];
}

async function control(method, path, body, res, query = {}) {
  const p = path.split('/').filter(Boolean); // __fake, ...
  if (p[1] === 'state') return send(res, 200, S);
  if (p[1] === 'reset') { reset(); return send(res, 200, { ok: true }); }
  // Added 1 Nov (Concierge): the fake AI's behaviour for the next calls, and what it was sent.
  if (p[1] === 'anthropic' && p[2] === 'mode') { S.anthropic.mode = body.mode || 'reply'; S.anthropic.flaked = false; return send(res, 200, { ok: true, mode: S.anthropic.mode }); }
  if (p[1] === 'anthropic' && p[2] === 'requests') return send(res, 200, S.anthropic.requests);
  if (p[1] === 'anthropic' && p[2] === 'clear') { S.anthropic.requests = []; return send(res, 200, { ok: true }); }
  if (p[1] === 'stripe' && (p[2] === 'pay' || p[2] === 'fail')) {
    const pi = S.payment_intents[p[3]]; if (!pi) return send(res, 404, { error: 'no pi' });
    if (p[2] === 'pay') { pi.status = pi.capture_method === 'manual' ? 'requires_capture' : 'succeeded'; pi.amount_received = pi.status === 'succeeded' ? pi.amount : 0; pi.latest_charge = id('ch'); pi.payment_method = pi.payment_method ?? (body.payment_method || 'pm_card_visa_4242'); }
    else pi.status = 'requires_payment_method';
    const code = await emit(p[2] === 'pay' ? (pi.status === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.amount_capturable_updated') : 'payment_intent.payment_failed', pi, query.webhook || body.webhook || WEBHOOK_URL);
    return send(res, 200, { pi, webhook: code });
  }
  if (p[1] === 'stripe' && p[2] === 'emit') return send(res, 200, { webhook: await emit(body.type, body.object, query.webhook || body.webhook || WEBHOOK_URL) });
  // Added 28 Oct (fixer 1): a membership renewal that failed: a new open invoice becomes the subscription's
  // latest (status past_due). invoice.payment_failed is sent only when a webhook is given.
  if (p[1] === 'stripe' && p[2] === 'invoice-failed') {
    const s = S.subscriptions[body.subscription]; if (!s) return send(res, 404, { error: 'no subscription' });
    const inv = makeInvoice(s, { status: 'open', paid: false, amount_paid: 0, amount_remaining: Number(body.amount ?? 1000), amount_due: Number(body.amount ?? 1000), total: Number(body.amount ?? 1000), status_transitions: { finalized_at: now(), paid_at: null } });
    s.latest_invoice = inv; s.status = 'past_due';
    const hook = query.webhook || body.webhook;
    return send(res, 200, { invoice: inv, webhook: hook ? await emit('invoice.payment_failed', inv, hook) : null });
  }
  if (p[1] === 'stripe' && p[2] === 'account') {
    const a = S.accounts[p[3]]; if (!a) return send(res, 404, { error: 'no account' });
    Object.assign(a, body); return send(res, 200, a);
  }
  // A PaymentIntent the bank wants to check (3-D Secure) or that the card declined, before /pay.
  if (p[1] === 'stripe' && p[2] === 'pi-status') {
    const pi = S.payment_intents[p[3]]; if (!pi) return send(res, 404, { error: 'no pi' });
    pi.status = body.status; return send(res, 200, pi);
  }
  if (p[1] === 'stripe' && p[2] === 'refund-mode') { S.refund_modes[body.payment_intent] = body.mode; return send(res, 200, { ok: true }); }
  if (p[1] === 'stripe' && p[2] === 'confirm-setup') {
    const si = S.setup_intents[p[3]]; if (!si) return send(res, 404, {}); si.status = 'succeeded'; si.payment_method = id('pm'); return send(res, 200, si);
  }
  return send(res, 404, { error: 'unknown control' });
}


// Added 1 Nov (Concierge): a fake of the Anthropic Messages API at fake-anthropic.test (ANTHROPIC_BASE_URL in tests).
// Modes (S.anthropic.mode): reply (searches, then the reply tool), clarify (a question, no places), books-once
// (offers to book, then behaves), books-always, text (ends without the reply tool, then answers when forced),
// pause (pause_turn once), badsource (a source that was not searched), style (dashes, exclamation, emoji, a time as
// a fact), memory (learns "Likes quiet places"), error (500), slow (waits 50 s); added 7 Nov: flaky (one 529, then
// answers), refuse-forced (every model refuses a forced tool choice), no-effort (refuses output_config), text-always
// (never uses the reply tool, even when nudged).
function anthropicRoute(req, body) {
  const A = S.anthropic;
  A.requests.push({ at: new Date().toISOString(), headers: { key: Boolean(req.headers['x-api-key']), version: req.headers['anthropic-version'] || null }, body });
  const forced = body.tool_choice && body.tool_choice.type === 'tool';
  // Added 7 Nov (Concierge hardening): like the real API, the 5.5 thinking models refuse a forced tool choice;
  // 'refuse-forced' makes every model refuse it; the nudge message counts as asking for the reply tool.
  const anyForced = body.tool_choice && (body.tool_choice.type === 'tool' || body.tool_choice.type === 'any');
  const refuse = (message) => [400, { type: 'error', error: { type: 'invalid_request_error', message } }];
  if (anyForced && (/(opus|sonnet)-5|fable|mythos/i.test(body.model || '') || A.mode === 'refuse-forced')) return refuse(`tool_choice: forced tool use is not supported for ${body.model} with thinking`);
  if (A.mode === 'no-effort' && body.output_config) return refuse('output_config: Extra inputs are not permitted');
  if (A.mode === 'flaky' && !A.flaked) { A.flaked = true; return [529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]; }
  const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  const nudged = lastUser && lastUser.content === 'Now send your answer with the reply tool.';
  const msg = (content, stop) => [200, { id: `msg_${crypto.randomBytes(6).toString('hex')}`, type: 'message', role: 'assistant', model: body.model, content, stop_reason: stop, usage: { input_tokens: 1200, output_tokens: 180, server_tool_use: { web_search_requests: 1 } } }];
  const results = [
    { type: 'web_search_result', url: 'https://calder.example.test/', title: 'Calder & Co', page_age: 'October 2026', encrypted_content: 'x' },
    { type: 'web_search_result', url: 'https://guide.example.test/best-quiet-suppers', title: 'Quiet suppers', page_age: 'September 2026', encrypted_content: 'y' },
  ];
  const search = [
    { type: 'text', text: 'Let me check a couple of places.' },
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'quiet supper restaurant London' } },
    { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: results },
  ];
  const place = (over = {}) => ({ name: 'Calder & Co', why: 'Candlelit, big round tables, easy to talk.', facts: ['Good for four', 'Candlelit'], address: '14 Mill Street, London N1 1AA', source_url: 'https://calder.example.test/', ...over });
  const replyTool = (input) => ({ type: 'tool_use', id: `toolu_${crypto.randomBytes(4).toString('hex')}`, name: 'reply', input });
  const good = { text: 'Two good ones for Thursday, both quiet enough to talk.', recommendations: [place(), place({ name: 'The Marlow Cellar', why: 'A wine list you can ask about, quieter upstairs.', facts: ['Quiet upstairs', 'Wine list'], address: '2 Brewery Lane, London SE1 2BB', source_url: 'https://guide.example.test/best-quiet-suppers' })] };
  switch (A.mode) {
    case 'error': return [500, { type: 'error', error: { type: 'api_error', message: 'fake: down' } }];
    case 'clarify': return msg([replyTool({ text: 'Which part of town, and how many of you?' })], 'tool_use');
    case 'steps': return msg([...search, replyTool({ text: 'Eight on a Saturday needs a booking, not a walk-in.', steps: ['Ring ahead and ask for the round table.', 'Ask for 19:00, the kitchen is calmer.'], sources: ['https://guide.example.test/best-quiet-suppers', 'https://never-searched.example.test/'] })], 'tool_use');
    case 'cutoff': return [200, { id: 'msg_cut', type: 'message', role: 'assistant', model: body.model, content: [...search, replyTool({ text: 'Two good' })], stop_reason: 'max_tokens', usage: {} }];
    case 'memory': return msg([...search, replyTool({ ...good, remembered: 'Likes quiet places' })], 'tool_use');
    case 'books-once': A.mode = 'reply'; return msg([...search, replyTool({ ...good, text: 'I’ll book you a table at Calder & Co for 19:00.', closing: 'Shall I reserve it?' })], 'tool_use');
    case 'books-always': return msg([...search, replyTool({ ...good, text: 'I’ll book you a table at Calder & Co.', steps: ['Ring them and ask for the round table.', 'I can book it for you if you like.'], closing: 'Shall I book it?' })], 'tool_use');
    case 'text': if (forced || nudged) { A.mode = 'reply'; return msg([replyTool(good)], 'tool_use'); } return msg([...search, { type: 'text', text: 'Calder & Co is lovely.' }], 'end_turn');
    case 'text-always': return msg([...search, { type: 'text', text: nudged ? 'Calder & Co, on Mill Street, is quiet enough to talk.' : 'Calder & Co is lovely.' }], 'end_turn');
    case 'pause': if (!body.messages.some((m) => m.role === 'assistant' && Array.isArray(m.content))) return msg(search, 'pause_turn'); A.mode = 'reply'; return msg([replyTool(good)], 'tool_use');
    case 'badsource': return msg([...search, replyTool({ ...good, recommendations: [place({ source_url: 'https://never-searched.example.test/' })] })], 'tool_use');
    case 'style': return msg([...search, replyTool({ text: 'Great news — two places! 🎉', recommendations: [place({ facts: ['Book for 19:30', 'Garden'] })] })], 'tool_use');
    default: return msg([...search, replyTool(good)], 'tool_use');
  }
}

const ssl = { key: fs.readFileSync(`${DIR}/certs/fakes.key`), cert: fs.readFileSync(`${DIR}/certs/fakes.crt`) };
https.createServer(ssl, (req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const raw = Buffer.concat(chunks).toString();
    const host = (req.headers.host || '').split(':')[0];
    const u = new URL(req.url, `https://${host}`);
    const query = Object.fromEntries(u.searchParams);
    try {
      if (u.pathname.startsWith('/__fake')) return control(req.method, u.pathname, raw ? JSON.parse(raw) : {}, res, query);
      if (host === 'api.stripe.com') {
        const body = raw ? parseForm(raw) : {};
        const [code, out] = stripeRoute(req.method, u.pathname, body, query);
        log({ kind: 'stripe', method: req.method, path: u.pathname, body, idem: req.headers['idempotency-key'] || null, code });
        return send(res, code, out ?? { error: { message: 'not found', type: 'invalid_request_error', code: 'resource_missing' } });
      }
      if (host === 'fake-anthropic.test') {
        const body = raw ? JSON.parse(raw) : {};
        if (S.anthropic.mode === 'slow') await new Promise((r) => setTimeout(r, 50000));
        const [code, out] = anthropicRoute(req, body);
        log({ kind: 'anthropic', mode: S.anthropic.mode, code });
        return send(res, code, out);
      }
      if (host === 'api.resend.com') {
        const body = raw ? JSON.parse(raw) : {};
        const items = Array.isArray(body) ? body : [body];
        // Added 27 Oct (foundation agent): an address containing "+fail" is refused, to prove failed sends are logged.
        if (items.some((m) => [].concat(m.to).some((t) => String(t).includes('+fail')))) { log({ kind: 'email', to: items.map((m) => m.to), subject: items[0]?.subject, from: items[0]?.from, refused: true }); return send(res, 422, { statusCode: 422, name: 'validation_error', message: 'fake: refused address' }); }
        const ids = items.map((m) => { const e = { id: crypto.randomUUID(), ...m, at: new Date().toISOString() }; S.emails.push(e); log({ kind: 'email', to: m.to, subject: m.subject, from: m.from }); return { id: e.id }; });
        return send(res, 200, Array.isArray(body) ? { data: ids } : ids[0]);
      }
      if (host === 'api.twilio.com' || host.endsWith('twilio.com')) {
        const body = raw ? querystring.parse(raw) : {};
        const m = { sid: `SM${crypto.randomBytes(16).toString('hex')}`, to: body.To, from: body.From ?? null, messaging_service_sid: body.MessagingServiceSid ?? null, body: body.Body, status: 'queued' };
        S.sms.push(m); log({ kind: 'sms', to: m.to, body: m.body });
        return send(res, 201, m);
      }
      return send(res, 404, { error: `fake: unknown host ${host}` });
    } catch (e) { log({ kind: 'error', error: String(e), path: u.pathname }); return send(res, 500, { error: String(e) }); }
  });
}).listen(443, '127.0.0.1', () => console.log('fakes on 443'));
