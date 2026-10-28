import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { dayDateTime, dayDateYear, dayMonthYear, firstNameOf, phoneWords } from "@/components/admin/format";
import { Avatar, Card, DL, Pill, Receipt, Section } from "@/components/admin/ui";
import { renderEmail, renderText } from "@/lib/emails";
import { ApplicationActions, type ApplicationPreviews } from "./ApplicationActions";
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
    const approval = renderEmail("approval", { firstName: first, loginEmail: app.email, paid: "£10", renewsOn: null });
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
  return (
    <Card labelledBy={headId}>
      {head}
      {details}
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
