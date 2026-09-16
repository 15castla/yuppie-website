import Link from "next/link";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { MembershipStatusBadge } from "../MembershipStatusBadge";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  membership_status: string;
};

const STATUS_FILTERS = ["active", "paused", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_HEADING: Record<StatusFilter, string> = {
  active: "Active Members",
  paused: "Paused Members",
  cancelled: "Cancelled Members",
};

const STATUS_EMPTY: Record<StatusFilter, string> = {
  active: "No active members.",
  paused: "No paused members.",
  cancelled: "No cancelled members — nobody's cancelled or let their membership lapse yet.",
};

// Reused for both the plain /admin/members list and the filtered views
// linked from the Dashboard's stat cards (e.g. "Cancelled / Expired" ->
// /admin/members?status=cancelled) — one page, so the two never drift into
// looking different.
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const status = (STATUS_FILTERS as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as StatusFilter)
    : null;

  const adminClient = createAdminSupabaseClient();
  let query = adminClient
    .from("members")
    .select("id, full_name, email, membership_status")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("membership_status", status);
  }

  const { data } = await query;
  const members = (data ?? []) as Member[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {status && (
          <Link
            href="/admin/members"
            className="text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
          >
            ← All members
          </Link>
        )}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {status ? STATUS_HEADING[status] : "Members"}
        </h1>
      </div>

      {members.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-cream p-8 text-center text-foreground/60">
          {status ? STATUS_EMPTY[status] : "No members yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/admin/members/${member.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-cream p-5 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">
                    {member.full_name || "—"}
                  </p>
                  <p className="truncate text-sm text-foreground/60">
                    {member.email}
                  </p>
                </div>
                <MembershipStatusBadge status={member.membership_status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
