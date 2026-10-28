import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { Banner } from "@/components/admin/bits";
import { dayDateTime, dayDateYear, dayMonthYear, firstNameOf, phoneWords, stripeCustomerUrl, stripeSubscriptionUrl } from "@/components/admin/format";
import { Icon } from "@/components/admin/icons";
import { Avatar, Card, DL, Pill, Receipt, Section } from "@/components/admin/ui";
import { renderEmail, renderText } from "@/lib/emails";
import { dayDate, pounds } from "@/lib/server/format";
import { periodEndSeconds } from "@/lib/server/stripe/period";
import { stripe } from "@/lib/stripe";
import { ApplicationActions, ReleaseCardAgain, type ApplicationPreviews } from "./ApplicationActions";
import { paymentProblem, tabOf } from "./applications-data";

// The application card (r2b 16). Waiting: Approve and Decline, each behind a confirm dialog (B-D17) that
// shows exactly what the person gets (rendered by lib/emails). Approved and Declined: what was done and sent.

type AppRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  linkedin_url: string | null;
  instagram_username: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  payment_error: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_subscription_id: string | null;
  card_released_at: string | null;
};

/**
 * One billing interval after `from`, the way Stripe sets a new subscription's first renewal: a month is the same
 * day next month (the last day when that month is shorter), in UTC like Stripe's billing anchor.
 */
function oneIntervalAfter(from: Date, recurring: { interval?: string | null; interval_count?: number | null } | null | undefined): Date {
  const count = recurring?.interval_count && recurring.interval_count > 0 ? recurring.interval_count : 1;
  const interval = recurring?.interval ?? "month";
  if (interval === "day" || interval === "week") return new Date(from.getTime() + count * (interval === "week" ? 7 : 1) * 86400000);
  const months = interval === "year" ? 12 * count : count;
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(from.getUTCDate(), lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
}

/**
 * What the approval email's Paid and Renews rows will say (QA2-07), the way sendApprovalMessages fills them:
 * from the subscription when one was made already (the account is half made), otherwise from the membership
 * price, with the first renewal one billing interval from now. Without Stripe: £10 and no Renews row.
 */
async function approvalMoney(subscriptionId: string | null): Promise<{ paid: string | null; renewsOn: string | null }> {
  try {
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const amount = sub.items?.data?.[0]?.price?.unit_amount;
      const end = periodEndSeconds(sub);
      return { paid: amount ? pounds(amount) : null, renewsOn: end ? dayDate(new Date(end * 1000)) : null };
    }
    const priceId = process.env.STRIPE_PRICE_ID_MEMBERSHIP;
    if (!priceId) return { paid: "£10", renewsOn: null };
    const price = await stripe.prices.retrieve(priceId);
    return { paid: price.unit_amount ? pounds(price.unit_amount) : null, renewsOn: dayDate(oneIntervalAfter(new Date(), price.recurring)) };
  } catch (err) {
    console.error("admin application card: reading the membership price failed:", err);
    return { paid: "£10", renewsOn: null };
  }
}

export async function ApplicationCard({ applicationId, done }: { applicationId: string; done?: string | null }) {
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("applications")
    .select(
      "id, full_name, email, phone, employer, role_title, linkedin_url, instagram_username, status, created_at, reviewed_at, reviewed_by, payment_error, stripe_customer_id, stripe_payment_method_id, stripe_subscription_id, card_released_at",
    )
    .eq("id", applicationId)
    .maybeSingle();
  const app = data as AppRow | null;
  if (!app) notFound();

  const tab = tabOf(app.status);
  const name = app.full_name?.trim() || app.email;
  const first = firstNameOf(app.full_name, app.email);
  const [{ data: logs }, { data: member }] = await Promise.all([
    db.from("message_log").select("template, channel, status").eq("application_id", app.id),
    tab === "approved"
      ? db.from("members").select("id, avatar_url, created_at").eq("email", app.email).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const sent = (template: string) => (logs ?? []).some((l) => l.template === template && l.status === "sent");

  const headId = `application-${app.id}`;
  const head = (
    <div className="ad-dh">
      <Avatar name={name} photoUrl={member?.avatar_url ?? null} size={56} />
      <div className="tt">
        <h2 id={headId} className="ad-h2">
          {name}
        </h2>
        <p className="sub">{tab === "approved" && member ? `Member since ${dayMonthYear(member.created_at)}` : `Applied ${dayDateTime(app.created_at)}`}</p>
      </div>
      {tab === "waiting" ? <Pill>Waiting</Pill> : tab === "approved" ? <Pill kind="ink">Approved</Pill> : <Pill kind="muted">Declined</Pill>}
    </div>
  );
  const details = (
    <DL
      rows={[
        ["Email", app.email],
        ["Phone", phoneWords(app.phone)],
        ["Employer", app.employer],
        ["Role", app.role_title],
        [
          "LinkedIn",
          app.linkedin_url ? (
            <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer">
              {app.linkedin_url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          ) : null,
        ],
        [
          "Instagram",
          app.instagram_username ? (
            <a href={`https://instagram.com/${app.instagram_username.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
              @{app.instagram_username.replace(/^@/, "")}
            </a>
          ) : null,
        ],
      ]}
    />
  );

  if (tab === "waiting") {
    // What the person will get, word for word (lib/emails): the welcome email and text, the decline email.
    const money = await approvalMoney(app.stripe_subscription_id);
    const approval = renderEmail("approval", { firstName: first, loginEmail: app.email, paid: money.paid, renewsOn: money.renewsOn });
    // The card is released on decline (C-D8), so the email says so whenever one is saved.
    const decline = renderEmail("decline", { cardReleased: Boolean(app.stripe_payment_method_id || app.card_released_at) });
    const previews: ApplicationPreviews = {
      approval: { subject: approval.subject, preheader: approval.preheader, html: approval.html },
      text: app.phone ? renderText("welcome", {}) : null,
      decline: { subject: decline.subject, preheader: decline.preheader, html: decline.html },
    };
    return (
      <Card labelledBy={headId}>
        {head}
        {details}
        <ApplicationActions
          key={app.id}
          applicationId={app.id}
          name={name}
          first={first}
          email={app.email}
          hasPhone={Boolean(app.phone)}
          problem={paymentProblem(app)}
          rawError={app.payment_error}
          subscriptionId={app.stripe_subscription_id}
          previews={previews}
          cardSaved={Boolean(app.stripe_payment_method_id) && !app.card_released_at}
        />
      </Card>
    );
  }

  if (tab === "approved") {
    const welcomeEmail = sent("approval");
    const welcomeText = sent("welcome");
    const welcome = welcomeEmail && welcomeText ? "Email and text sent" : welcomeEmail ? (app.phone ? "Email sent, text not sent" : "Email sent. No phone number, so no text.") : "Not sent yet";
    const memberHref = member ? `/admin/members/${member.id}` : "/admin/members";
    return (
      <Card labelledBy={headId}>
        {head}
        {details}
        {done === "was-approved" && (
          <section className="ad-sec">
            <Banner title={`${first} was approved already.`} info>
              Nothing was charged again, and nothing was sent.
            </Banner>
          </section>
        )}
        {done === "approved" ? (
          <section className="ad-sec">
            <Receipt title={`${first} is in.`}>
              First payment taken. Account made. Welcome email{app.phone ? " and text sent." : " sent. No phone number, so no text."}
            </Receipt>
            <div className="ad-acts">
              <Link className="ad-btn sm" href={memberHref}>
                Open {first} in Members
              </Link>
            </div>
          </section>
        ) : (
          <Section title="Review">
            <DL
              rows={[
                ["Approved", app.reviewed_at ? `${dayDateYear(app.reviewed_at)}${app.reviewed_by ? ` by ${app.reviewed_by}` : ""}` : null],
                ["First payment", app.stripe_subscription_id ? `Taken${app.reviewed_at ? ` ${dayDateYear(app.reviewed_at)}` : ""}` : null],
                ["Welcome", welcome],
              ]}
            />
            <div className="ad-acts">
              <Link className="ad-btn sm secondary" href={memberHref}>
                Open {first} in Members
              </Link>
            </div>
          </Section>
        )}
      </Card>
    );
  }

  const emailed = sent("decline");
  const cardStuck = !app.card_released_at && Boolean(app.stripe_payment_method_id);
  return (
    <Card labelledBy={headId}>
      {head}
      {details}
      {done === "was-declined" && (
        <section className="ad-sec">
          <Banner title={`${first}’s application was declined already.`} info>
            {/* QA2-15: never "Nothing was charged" when a subscription exists (the banner below says what to do). */}
            {app.stripe_subscription_id ? "No account was made." : "Nothing was charged and no account was made."}
          </Banner>
        </section>
      )}
      {done === "declined" && (
        <section className="ad-sec">
          <Receipt title={`${first} is declined.`}>{emailed ? "A decline email was sent." : "No email was sent."}</Receipt>
          <div className="ad-acts">
            <Link className="ad-btn sm secondary" href="/admin/applications">
              Back to waiting
            </Link>
          </div>
        </section>
      )}
      {app.stripe_subscription_id && (
        <section className="ad-sec">
          <Banner title={`${first} was charged, but the application is declined.`}>
            There is no account. Refund the first payment and cancel the subscription in Stripe.
          </Banner>
          <div className="ad-acts">
            <a className="ad-btn sm secondary" href={stripeSubscriptionUrl(app.stripe_subscription_id)} target="_blank" rel="noopener noreferrer">
              Open in Stripe
              <Icon name="external" size={16} />
            </a>
          </div>
        </section>
      )}
      {cardStuck && (
        <section className="ad-sec">
          <Banner title="Stripe didn’t remove the saved card.">
            {emailed ? "The decline email left out the line about the card. " : ""}
            {app.stripe_subscription_id ? "" : "Nothing is charged. "}Try again, or remove it in Stripe. The club inbox has the details.
          </Banner>
          <ReleaseCardAgain applicationId={app.id} stripeUrl={app.stripe_customer_id ? stripeCustomerUrl(app.stripe_customer_id) : null} />
        </section>
      )}
      <Section title="Review">
        <DL
          rows={[
            ["Declined", app.reviewed_at ? `${dayDateYear(app.reviewed_at)}${app.reviewed_by ? ` by ${app.reviewed_by}` : ""}` : null],
            ["Decline email", emailed ? "Sent" : "Not sent"],
            ["Saved card", app.card_released_at ? "Removed in Stripe" : app.stripe_payment_method_id ? "Still saved in Stripe" : "None saved"],
          ]}
        />
        <p className="ad-hint">{emailed ? "Subject: Your Club Yuppie application." : `${first} was not emailed.`}</p>
      </Section>
    </Card>
  );
}
