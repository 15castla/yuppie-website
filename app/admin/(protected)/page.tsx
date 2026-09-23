import Link from "next/link";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { APPLICATION_TAB_LABELS } from "@/app/admin/application-tab-labels";

function getSevenDaysAgoIso() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
        {label}
      </p>
      <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-2xl border border-foreground/10 bg-cream p-6 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-2xl border border-foreground/10 bg-cream p-6">{content}</div>;
}

export default async function AdminDashboardPage() {
  const adminClient = createAdminSupabaseClient();
  const sevenDaysAgo = getSevenDaysAgoIso();

  const [
    { count: totalMembers },
    { count: cancelledMembers },
    { count: pendingApplications },
    { count: totalApplications },
    { count: newThisWeek },
  ] = await Promise.all([
    adminClient.from("members").select("*", { count: "exact", head: true }),
    // "cancelled" is the only lapsed-membership status the schema has
    // (membership_status: active/paused/cancelled, see require-member.ts).
    // There's no separate "expired" value, so a subscription someone let
    // lapse ends up here too, same as one they actively cancelled.
    adminClient
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("membership_status", "cancelled"),
    adminClient
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    adminClient.from("applications").select("*", { count: "exact", head: true }),
    adminClient
      .from("applications")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Members" value={totalMembers ?? 0} href="/admin/members" />
        <StatCard
          label="Cancelled / Expired"
          value={cancelledMembers ?? 0}
          href="/admin/members?status=cancelled"
        />
        <StatCard
          label={APPLICATION_TAB_LABELS.pending}
          value={pendingApplications ?? 0}
        />
        <StatCard
          label="Total Applications"
          value={totalApplications ?? 0}
        />
        <StatCard label="New This Week" value={newThisWeek ?? 0} />
      </div>
    </div>
  );
}
