import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { dayDateTime, dayMonthYear, phoneWords, pounds } from "@/components/admin/format";
import { Avatar, DL, Pill } from "@/components/admin/ui";
import { MEMBER_ROW_COLUMNS, type MemberRow } from "@/lib/server/db";
import { membershipState } from "@/lib/server/membership";
import { currentPhotoUrl } from "@/lib/server/photos";

// The nominating member's profile, as the small window on an application shows it (NominatorPeek, 13 Nov 2026):
// who they are, how their membership stands, what they have done in the club, any reports about them, and the
// people they have nominated (this application marked). Read on the server with the service role, like the
// member card it summarises (MemberCard.tsx); nothing here changes anything.

type Booking = { status: string; event: { start_time: string } | { start_time: string }[] | null };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function NominatorSummary({ memberId, applicationId }: { memberId: string; applicationId: string }) {
  const db = createAdminSupabaseClient();
  const [{ data }, photoUrl, bookingsRes, plansRes, reportsRes, nomineesRes, ledgerRes] = await Promise.all([
    db.from("members").select(`${MEMBER_ROW_COLUMNS}, nominations_allowed`).eq("id", memberId).maybeSingle(),
    currentPhotoUrl(memberId, "thumb").catch(() => null),
    db.from("bookings").select("status, event:events(start_time)").eq("member_id", memberId),
    db.from("plans").select("id", { count: "exact", head: true }).eq("host_id", memberId).is("removed_at", null),
    db.from("reports").select("status").eq("member_id", memberId),
    db.from("applications").select("id, full_name, email, status, created_at").eq("nominated_by", memberId).order("created_at", { ascending: false }),
    db.from("credit_ledger").select("amount_pence").eq("member_id", memberId),
  ]);
  const member = data as (MemberRow & { nominations_allowed: number | null }) | null;
  if (!member) return <p className="ad-p">This member can’t be found any more.</p>;

  const name = member.full_name?.trim() || member.email;
  const info = membershipState(member);
  const status =
    info.state === "active" ? (
      <Pill kind="ink">Active</Pill>
    ) : info.state === "paused" ? (
      <Pill>Paused</Pill>
    ) : info.state === "cancelled" ? (
      <Pill kind="muted">Ended</Pill>
    ) : info.state === "ending" ? (
      <Pill>Ending {info.endsOn}</Pill>
    ) : (
      <Pill kind="err">Payment failed</Pill>
    );

  const now = new Date().getTime();
  const bookings = ((bookingsRes.data ?? []) as Booking[]).filter((b) => b.status === "confirmed");
  const startOf = (b: Booking) => {
    const event = Array.isArray(b.event) ? b.event[0] : b.event;
    return event ? new Date(event.start_time).getTime() : NaN;
  };
  const been = bookings.filter((b) => startOf(b) <= now).length;
  const coming = bookings.filter((b) => startOf(b) > now).length;
  const events = been || coming ? [been ? `${been} been to` : null, coming ? `${coming} coming up` : null].filter(Boolean).join(", ") : "None booked yet";

  const plans = plansRes.count ?? 0;
  const reports = (reportsRes.data ?? []) as { status: string }[];
  const open = reports.filter((r) => r.status === "open").length;
  const reportWords = reports.length ? `${plural(reports.length, "report", "reports")}${open ? `, ${open} still open` : ", all dealt with"}` : "None";

  const nominees = (nomineesRes.data ?? []) as { id: string; full_name: string | null; email: string; status: string; created_at: string }[];
  const allowed = member.nominations_allowed ?? 5;
  const credit = ((ledgerRes.data ?? []) as { amount_pence: number }[]).reduce((sum, r) => sum + r.amount_pence, 0);

  return (
    <div className="ad-peek">
      <div className="ad-peek-head">
        <Avatar name={name} photoUrl={photoUrl} size={64} />
        <div className="tt">
          <span className="sub">Member since {dayMonthYear(member.created_at)}</span>
          {status}
        </div>
      </div>
      <DL
        rows={[
          ["Email", member.email],
          ["Phone", phoneWords(member.phone)],
          ["Employer", member.employer],
          ["Role", member.role_title],
          ["Club events", events],
          ["Open Invites", plans ? `${plans} posted` : "None posted"],
          ["Reports", reportWords],
          ["Nominations", `${nominees.length} of ${allowed} used`],
          ["Credit", pounds(credit)],
        ]}
      />
      {nominees.length > 0 && (
        <div className="ad-peek-list">
          {nominees.map((n) => (
            <div className="ad-booking" key={n.id}>
              <span className="t">
                {n.full_name?.trim() || n.email}
                {n.id === applicationId ? <span className="ad-peek-this"> · this application</span> : null}
              </span>
              <span className="m">Applied {dayDateTime(n.created_at)}</span>
              <span className="pl">
                {n.status === "approved" ? <Pill kind="ink">Approved</Pill> : n.status === "pending" ? <Pill>Waiting</Pill> : <Pill kind="muted">Declined</Pill>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
