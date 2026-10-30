import { requireAdmin } from "@/app/admin/require-admin";
import { listMembers } from "./members-data";
import { MemberCard } from "./MemberCard";

const norm = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// /admin/members: from 768 the first member in the list (with its search and filter) shows beside it; on a
// phone, the list alone.
export default async function MembersIndexPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const { q, status } = await searchParams;
  const needle = norm(q ?? "");
  const rows = (await listMembers()).filter(
    (r) => (!status || status === "all" || r.status === status) && (!needle || norm(r.name).includes(needle) || norm(r.email).includes(needle)),
  );
  if (!rows.length) return null;
  return <MemberCard memberId={rows[0].id} />;
}
