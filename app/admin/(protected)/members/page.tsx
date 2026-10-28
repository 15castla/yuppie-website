import { listMembers } from "./members-data";
import { MemberCard } from "./MemberCard";

// /admin/members: from 768 the first member's card shows beside the list; on a phone, the list alone.
export default async function MembersIndexPage() {
  const rows = await listMembers();
  if (!rows.length) return null;
  return <MemberCard memberId={rows[0].id} />;
}
