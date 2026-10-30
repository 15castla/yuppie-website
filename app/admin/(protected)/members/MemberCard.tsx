import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { CopyButton } from "@/components/admin/bits";
import { dayDate, dayDateTime, dayDateYear, dayMonthYear, firstNameOf, phoneWords, pounds, stripeCustomerUrl } from "@/components/admin/format";
import { Icon } from "@/components/admin/icons";
import { Avatar, Card, DL, Pill, Section, StatusPill } from "@/components/admin/ui";
import { stripe } from "@/lib/stripe";
import { MEMBER_ROW_COLUMNS, type MemberRow } from "@/lib/server/db";
import { membershipState } from "@/lib/server/membership";
import { currentPhotoUrl } from "@/lib/server/photos";
import { periodEndSeconds } from "@/lib/server/stripe/period";
import { DeleteMember } from "./DeleteMember";
import { MembershipControl, type MembershipView } from "./MembershipControl";

// The member card (r2b 15): details, Membership (with the status control: Pause, Resume, Cancel now, each
// asking about Stripe, B-D2, B-D23), Bookings (newest first), Billing, From their application, Danger zone.

type BookingRow = {
  id: string;
  status: "confirmed" | "cancelled";
  booked_at: string;
  amount_pence: number;
  cancel_reason: string | null;
  refund_status: "none" | "pending" | "succeeded" | "failed";
  refund_pence: number | null;
  event: { id: string; title: string; start_time: string; location: string | null } | { id: string; title: string; start_time: string; location: string | null }[] | null;
};

const ENDED_WHY: Record<string, (first: string) => string> = {
  member_cancelled: (first) => `${first} cancelled it.`,
  payment_failed: () => "A payment failed and the card wasn’t updated.",
  admin_cancelled: () => "Cancelled here by the club.",
  account_deleted: (first) => `${first} deleted the account.`,
};

async function renewsAt(subscriptionId: string | null): Promise<Date | null> {
  if (!subscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const end = periodEndSeconds(sub);
    return end ? new Date(end * 1000) : null;
  } catch (err) {
    console.error(`admin member card: reading subscription ${subscriptionId} failed:`, err);
    return null;
  }
}

function bookingAmount(b: BookingRow): string {
  if (b.status === "cancelled") {
    if (b.refund_status === "succeeded") return `${pounds(b.refund_pence ?? b.amount_pence)} refunded`;
    if (b.refund_status === "pending") return "Refund on its way";
    if (b.refund_status === "failed") return "Refund failed";
    return b.amount_pence > 0 ? "Not refunded" : "Included";
  }
  return b.amount_pence > 0 ? `${pounds(b.amount_pence)} paid` : "Included";
}

export async function MemberCard({ memberId }: { memberId: string }) {
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const { data } = await db.from("members").select(MEMBER_ROW_COLUMNS).eq("id", memberId).maybeSingle();
  const member = data as MemberRow | null;
  if (!member) notFound();

  const name = member.deleted_at ? "Deleted member" : member.full_name?.trim() || member.email;
  const first = member.deleted_at ? "The member" : firstNameOf(member.full_name, member.email);
  const now = new Date();
  const base = membershipState(member, now);
  const renews = base.state === "active" ? await renewsAt(member.stripe_subscription_id) : null;
  const info = renews ? membershipState(member, now, { renewsAt: renews }) : base;

  const [bookingsRes, appRes, pauseAudit, deleteAudit, photoUrl] = await Promise.all([
    db
      .from("bookings")
      .select("id, status, booked_at, amount_pence, cancel_reason, refund_status, refund_pence, event:events(id, title, start_time, location)")
      .eq("member_id", member.id)
      .order("booked_at", { ascending: false }),
    db
      .from("applications")
      .select("created_at, employer, role_title, linkedin_url, instagram_username, reviewed_at, reviewed_by")
      .eq("email", member.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    member.membership_status === "paused"
      ? db.from("admin_audit").select("details").eq("action", "member.pause").eq("target_id", member.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    member.deleted_at
      ? db.from("admin_audit").select("created_at").eq("action", "member.delete").eq("target_id", member.id).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    // The member's current photo from the private bucket (a signed link), not the old public avatar_url (stage 2).
    member.deleted_at ? Promise.resolve(null) : currentPhotoUrl(member.id, "thumb"),
  ]);
  const bookings = (bookingsRes.data ?? []) as BookingRow[];
  const future = bookings.filter((b) => {
    const e = Array.isArray(b.event) ? b.event[0] : b.event;
    return b.status === "confirmed" && e && new Date(e.start_time) > now;
  });
  const futureBookings = future.length;
  const futurePaidPence = future.reduce((sum, b) => sum + (b.amount_pence > 0 ? b.amount_pence : 0), 0);
  const app = appRes.data;
  const pausedWithStripe = (pauseAudit.data?.details as { stripe?: boolean } | undefined)?.stripe ?? null;

  // What the Membership section says (the design's lines; ending and problem are the backend's states).
  let line: string;
  let note: string | null = null;
  switch (info.state) {
    case "active":
      line = info.renewsOn ? `Active. £10 a month, renews ${info.renewsOn}.` : "Active. £10 a month.";
      break;
    case "ending":
      line = `Ending. ${first} asked to cancel, so access ends on ${dayDate(member.cancel_at as string)}.`;
      note = member.cancel_reason ? `Reason given: “${member.cancel_reason}”` : null;
      break;
    case "problem":
      line = `A payment failed on ${dayDate(member.payment_failed_at as string)}. Access ends on ${dayDate(member.grace_until as string)} unless ${first} updates the card.`;
      break;
    case "paused":
      line = `Paused${member.paused_at ? ` on ${dayDate(member.paused_at)}` : ""}.${
        pausedWithStripe === true ? " Payments are paused in Stripe." : pausedWithStripe === false ? " Payments in Stripe were left as they were." : ""
      }`;
      break;
    case "cancelled": {
      const at = member.ended_at ?? info.endsAt ?? null;
      const why = member.ended_reason ? ENDED_WHY[member.ended_reason]?.(first) : member.cancel_at ? "The cancel date passed." : null;
      line = `Cancelled${at ? ` on ${dayDate(at)}` : ""}.${why ? ` ${why}` : ""}`;
      note = `Cancelled is final. To come back, ${first} applies again and goes through approval.`;
      break;
    }
  }
  if (member.deleted_at) {
    // A deleted account (Delete member here, or the member's own Delete my account): the details are gone, the
    // bookings and payments stay for the record. Nothing to change and nothing to delete.
    line = `Deleted on ${dayDate(member.deleted_at)}. ${deleteAudit.data ? "Deleted here by the club." : "The member deleted the account."}`;
    note = "The details are gone. Bookings and payment records are kept. To come back, they apply again.";
  }
  const view: MembershipView = {
    memberId: member.id,
    first,
    status: info.state === "cancelled" ? "cancelled" : member.membership_status === "paused" ? "paused" : "active",
    line,
    note,
    hasSubscription: Boolean(member.stripe_subscription_id) && info.state !== "cancelled",
    pausedWithStripe,
    futureBookings,
  };

  const headId = `member-${member.id}`;
  return (
    <Card labelledBy={headId}>
      <div className="ad-dh">
        <Avatar name={name} photoUrl={photoUrl} size={56} />
        <div className="tt">
          <h2 id={headId} className="ad-h2">
            {name}
          </h2>
          <p className="sub">Member since {dayMonthYear(member.created_at)}</p>
        </div>
        <StatusPill status={view.status} />
      </div>
      <DL
        rows={[
          ["Email", member.email],
          ["Phone", phoneWords(member.phone)],
          ["Employer", member.employer],
          ["Role", member.role_title],
          ["Bio", member.bio],
        ]}
      />

      <MembershipControl key={member.id} view={view} />

      <Section title="Bookings" hint="Every event this member has booked, newest first.">
        {bookings.length === 0 ? (
          <p className="ad-p" style={{ fontSize: 15 }}>
            No bookings yet.
          </p>
        ) : (
          <div style={{ marginTop: 12, borderTop: "1.5px solid var(--ink)" }}>
            {bookings.map((b) => {
              const e = Array.isArray(b.event) ? b.event[0] : b.event;
              return (
                <div className="ad-booking" key={b.id}>
                  <span className="t">{e?.title ?? "An event"}</span>
                  <span className="m">
                    {e ? dayDateTime(e.start_time) : ""}
                    {e?.location ? ` · ${e.location}` : ""}
                  </span>
                  <span className="pl">
                    {b.status === "confirmed" ? <Pill kind="ink">Confirmed</Pill> : <Pill kind="muted">Cancelled</Pill>}
                    <span>{bookingAmount(b)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Billing">
        <DL
          rows={[
            ["Customer", member.stripe_customer_id ? <CopyButton value={member.stripe_customer_id} label="customer" /> : null],
            ["Subscription", member.stripe_subscription_id ? <CopyButton value={member.stripe_subscription_id} label="subscription" /> : null],
            ["Member ID", <CopyButton key="id" value={member.id} label="member ID" />],
          ]}
        />
        {member.stripe_customer_id && (
          <div className="ad-acts" style={{ marginTop: 12 }}>
            <a className="ad-btn sm secondary" href={stripeCustomerUrl(member.stripe_customer_id)} target="_blank" rel="noopener noreferrer">
              Open in Stripe
              <Icon name="external" size={16} />
            </a>
          </div>
        )}
      </Section>

      {app && (
        <Section title="From their application" hint="Captured when they applied. Employer and role may be out of date if they have updated their profile since.">
          <DL
            rows={[
              ["Submitted", dayDateYear(app.created_at)],
              ["Reviewed", app.reviewed_at ? `${dayDateYear(app.reviewed_at)}${app.reviewed_by ? ` by ${app.reviewed_by}` : ""}` : null],
              ["Employer then", app.employer],
              ["Role then", app.role_title],
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
        </Section>
      )}

      {!member.deleted_at && (
        <Section title="Danger zone" danger>
          <p className="ad-hint">
            Deletes {first}’s account the way Delete my account does: the subscription is cancelled, future bookings are cancelled and
            refunded, and their details are removed. This can’t be undone.
          </p>
          <DeleteMember
            memberId={member.id}
            name={name}
            first={first}
            hasSubscription={view.hasSubscription}
            futureBookings={futureBookings}
            futurePaidPence={futurePaidPence}
          />
        </Section>
      )}
    </Card>
  );
}
