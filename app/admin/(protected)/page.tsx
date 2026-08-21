import { createAdminSupabaseClient } from "@/app/admin/admin-client";

function getSevenDaysAgoIso() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
        {label}
      </p>
      <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const adminClient = createAdminSupabaseClient();
  const sevenDaysAgo = getSevenDaysAgoIso();

  const [
    { count: totalMembers },
    { count: pendingApplications },
    { count: totalApplications },
    { count: newThisWeek },
    { count: unconfirmedInvites },
  ] = await Promise.all([
    adminClient.from("members").select("*", { count: "exact", head: true }),
    adminClient
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    adminClient.from("applications").select("*", { count: "exact", head: true }),
    adminClient
      .from("applications")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    adminClient
      .from("invited_emails")
      .select("*, applications!inner(status)", { count: "exact", head: true })
      .eq("used", false)
      .eq("applications.status", "approved"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Members" value={totalMembers ?? 0} />
        <StatCard
          label="Pending Applications"
          value={pendingApplications ?? 0}
        />
        <StatCard
          label="Total Applications"
          value={totalApplications ?? 0}
        />
        <StatCard label="New This Week" value={newThisWeek ?? 0} />
        <StatCard
          label="Unconfirmed Invites"
          value={unconfirmedInvites ?? 0}
        />
      </div>
    </div>
  );
}
