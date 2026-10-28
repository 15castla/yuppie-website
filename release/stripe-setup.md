# Stripe set-up for the members backend (Phase A)

What the live Stripe account needs before (or straight after) the Phase A release, as API calls the release
can run. Read with `live-schema/stripe-setup-2026-10-27.md` (27 Oct 2026): the live webhook endpoint
`https://clubyuppie.com/api/stripe/webhook` is enabled but listens only to `checkout.session.completed`, and
there is no Billing Portal configuration.

Every call below uses the live secret key from the environment, never pasted into a file or a chat:
`-u "$STRIPE_SECRET_KEY:"` (the colon means "no password"). Nothing here touches customers or subscriptions.

## 1. The webhook endpoint: the nine events the code handles

`app/api/stripe/webhook/route.ts` (through `lib/server/stripe/webhook.ts`) handles exactly these:

| event | what the code does |
|---|---|
| `payment_intent.succeeded` | records a paid event booking (the same idempotent path as the page) |
| `payment_intent.payment_failed` | records the event, books nothing |
| `invoice.payment_failed` | membership payment failed: sets the 3-day grace (C-D12), one email per invoice |
| `invoice.paid` | clears the payment problem |
| `customer.subscription.updated` | syncs the cancel date and a pause made in Stripe; status `canceled` ends the membership |
| `customer.subscription.deleted` | ends the membership, cancels and refunds future bookings (A-D8), one email |
| `charge.refunded` | records a refund (ours, or one made by hand in the Dashboard) on the booking |
| `customer.updated` | a member whose membership payment failed saved a new default card in the portal: it becomes the subscription's card and the open invoice is paid now (QA3-02) |
| `payment_method.attached` | the same, when the portal attaches the card (whichever event comes first does it; the second finds nothing to do) |

Every handler reads the subscription (and customer) from Stripe as it is now, not from the event, because
Stripe does not promise the order; and an event about another subscription of the same customer, or a one-off
invoice, is ignored. A handler that cannot reach the database or Stripe answers 500, so Stripe retries it.

**Switch the new events on only after the deploy** (QA3 checklist 8): the code before this release does not
know them (it would answer 200 and ignore them, so nothing breaks, but the events would be spent).

**The card on new subscriptions (QA3-02).** Approving an application now sets the saved card as the
customer's `invoice_settings.default_payment_method` and creates the subscription without a card of its own,
so a card the member saves later in the portal is the one Stripe charges. Members approved before the release
have a subscription-level `default_payment_method`; no data change is needed for them: the
`customer.updated` / `payment_method.attached` handlers set the new card on the subscription when a member in
the payment problem state saves one.

`checkout.session.completed` is not handled by any code (it is left from the old Checkout flow), so it can go.
Today `payment_intent.succeeded` is not delivered at all, so a paid booking is only recorded when the
member's page confirms it; a payment that finishes after a bank redirect or with the app closed is not booked
until the member comes back. This change fixes that.

### 1a. Find the endpoint and its API version

```bash
curl -sS -G https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" -d limit=100
```

Note the `id` (`we_...`) of the one whose `url` is `https://clubyuppie.com/api/stripe/webhook`, and its
`api_version` (null means the account's default version).

### 1b. Replace its event list (recommended: keeps the signing secret, so STRIPE_WEBHOOK_SECRET is unchanged)

```bash
curl -sS https://api.stripe.com/v1/webhook_endpoints/we_REPLACE_ME -u "$STRIPE_SECRET_KEY:" \
  -d "enabled_events[]=payment_intent.succeeded" \
  -d "enabled_events[]=payment_intent.payment_failed" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d "enabled_events[]=invoice.paid" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=charge.refunded" \
  -d "enabled_events[]=customer.updated" \
  -d "enabled_events[]=payment_method.attached" \
  -d "description=Club Yuppie members backend (Phase A)"
```

Sending `enabled_events[]` replaces the whole list. Payloads come in the endpoint's API version. The
handlers read both the older and the 2025-03-31+ shapes where they differ (an invoice's subscription at the
top or under `parent.subscription_details`; a subscription's period end on the subscription or on its
items), so the endpoint's current version is fine.

### 1c. Only if you want payloads pinned to the SDK's version (optional, more steps)

The API version of an endpoint can only be set when it is made. To pin it to the version the installed SDK
uses (`stripe` 22.6.1, `2026-08-26.dahlia`):

```bash
curl -sS https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" \
  -d url=https://clubyuppie.com/api/stripe/webhook \
  -d api_version=2026-08-26.dahlia \
  -d "enabled_events[]=payment_intent.succeeded" \
  -d "enabled_events[]=payment_intent.payment_failed" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d "enabled_events[]=invoice.paid" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=charge.refunded" \
  -d "enabled_events[]=customer.updated" \
  -d "enabled_events[]=payment_method.attached"
```

The answer holds a new `secret` (`whsec_...`): put it in Vercel production as `STRIPE_WEBHOOK_SECRET`,
redeploy, then disable the old endpoint:

```bash
curl -sS https://api.stripe.com/v1/webhook_endpoints/we_OLD -u "$STRIPE_SECRET_KEY:" -d disabled=true
```

## 2. The Billing Portal configuration

The members area opens the portal for "Manage" and "Update card" (`/members/billing`, and the
payment-failed email's link). Ours, not the portal's: cancelling (the two-step Cancel membership on You) and
the email address (it is the login, changed with a code). So the portal gets: update the payment method,
see invoices, nothing else.

```bash
curl -sS https://api.stripe.com/v1/billing_portal/configurations -u "$STRIPE_SECRET_KEY:" \
  -d "default_return_url=https://clubyuppie.com/members/you" \
  -d "business_profile[privacy_policy_url]=https://clubyuppie.com/privacy" \
  -d "features[payment_method_update][enabled]=true" \
  -d "features[invoice_history][enabled]=true" \
  -d "features[customer_update][enabled]=false" \
  -d "features[subscription_cancel][enabled]=false" \
  -d "features[subscription_update][enabled]=false" \
  -d "login_page[enabled]=false" \
  -d "metadata[app]=club-yuppie-members"
```

Note the `id` (`bpc_...`). A configuration made through the API is not the account default, and there is no
default today, so either:

- **set `STRIPE_PORTAL_CONFIGURATION_ID=bpc_...` in Vercel production** and redeploy (the code passes it to
  every portal session: `lib/server/membership-actions.ts` `billingPortalUrl`), or
- save the same settings as the default in the Dashboard (Settings, Billing, Customer portal).

The first is recommended: it is one value and needs no clicking. Every return URL the code sends is on
`https://clubyuppie.com/members/...` (default `/members/you`).

If Stripe answers that a terms of service URL is required, the site has no terms page today
(`/privacy` exists, `/terms` does not): Albert needs one before this call can include
`business_profile[terms_of_service_url]`.

## 3. Check

```bash
# the nine events, enabled
curl -sS https://api.stripe.com/v1/webhook_endpoints/we_REPLACE_ME -u "$STRIPE_SECRET_KEY:"
# active, with the features above
curl -sS https://api.stripe.com/v1/billing_portal/configurations/bpc_REPLACE_ME -u "$STRIPE_SECRET_KEY:"
# a session opens for an existing customer (use your own customer id); open the url in a browser
curl -sS https://api.stripe.com/v1/billing_portal/sessions -u "$STRIPE_SECRET_KEY:" \
  -d customer=cus_REPLACE_ME -d configuration=bpc_REPLACE_ME \
  -d return_url=https://clubyuppie.com/members/you \
  -d "flow_data[type]=payment_method_update"
```

After the release, the Dashboard's webhook page shows each delivery with the answer from our route
(`{"received":true,"status":"processed",...}`; a repeat says `"duplicate"`). A 500 means a handler failed and
Stripe retries it; the reason is in the Vercel logs and in `stripe_events.error`.

## 4. Not code, Albert's in the Dashboard

- C-D9: once our emails are live, switch off Stripe's own customer emails (successful payments, refunds,
  failed payments), so members do not get two of each.
- The test-mode key in `.env.local` is invalid (`StripeAuthenticationError`); previews need a working test key
  and a test-mode endpoint with the same nine events if they are to take payments.
