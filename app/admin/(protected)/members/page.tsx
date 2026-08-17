import Link from "next/link";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { MembershipStatusBadge } from "../MembershipStatusBadge";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  membership_status: string;
};

export default async function MembersPage() {
  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("members")
    .select("id, full_name, email, membership_status")
    .order("created_at", { ascending: false });

  const members = (data ?? []) as Member[];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Members
      </h1>

      {members.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-8 text-center text-foreground/60">
          No members yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/admin/members/${member.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-[#F5F3E7] p-5 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
