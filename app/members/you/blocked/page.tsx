import { BlockedView } from "@/components/members/messages/blocked-view";
import { listBlockedMembers } from "@/lib/server/blocks";
import { requireMessages } from "../../messages/guard";
import { requireMember } from "../../require-member";
import { unblockMember } from "./actions";

// You > Blocked members, real data (lib/server/blocks.ts listBlockedMembers: first name, the photo while you still
// share a chat or a plan, the date). Hidden with Messages (requireMessages: in the app while Open Invite is hidden).
// Unblock is ./actions.ts (asks first; the row goes once the server says so). A list that cannot load goes to the
// error page rather than reading as "No one blocked." (the design has no error state for this page).
export default async function BlockedMembersPage() {
  await requireMessages();
  const member = await requireMember();
  const members = await listBlockedMembers(member.id);
  return <BlockedView members={members} unblock={unblockMember} />;
}
