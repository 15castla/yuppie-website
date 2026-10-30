import { BlockedView } from "@/components/members/messages/blocked-view";
import { requireFlag } from "@/lib/members/flags";
import { listBlockedMembers } from "@/lib/server/blocks";
import { requireMember } from "../../require-member";
import { unblockMember } from "./actions";

// You > Blocked members, real data (lib/server/blocks.ts listBlockedMembers: first name, signed photo, the date).
// Unblock is ./actions.ts (asks first; the row goes once the server says so). A list that cannot load goes to the
// error page rather than reading as "No one blocked." (the design has no error state for this page).
export default async function BlockedMembersPage() {
  requireFlag("messages");
  const member = await requireMember();
  const members = await listBlockedMembers(member.id);
  return <BlockedView members={members} unblock={unblockMember} />;
}
