import { BlockedView } from "@/components/members/messages/blocked-view";
import { requireFlag } from "@/lib/members/flags";
import type { BlockedMember } from "@/lib/members/messages/types";
import { listBlockedMembers } from "@/lib/server/blocks";
import { requireMember } from "../../require-member";

// You > Blocked members, real data. Unblock is app/members/you/blocked/actions.ts.
export default async function BlockedMembersPage() {
  requireFlag("messages");
  const member = await requireMember();
  let members: BlockedMember[] = [];
  try {
    members = await listBlockedMembers(member.id);
  } catch (err) {
    // A list that cannot load reads as empty here; the screen agent owns an error state if the design has one.
    console.error(`blocked members failed for ${member.id}:`, err);
  }
  return <BlockedView members={members} />;
}
