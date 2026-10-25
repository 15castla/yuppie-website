import { BlockedView } from "@/components/members/messages/blocked-view";
import { requireFlag } from "@/lib/members/flags";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { listBlockedMembers } from "@/lib/members/mock/messages";
import type { BlockedMember } from "@/lib/members/messages/types";
import { requireMember } from "../../require-member";

// Blocked members. Switched off (flag `messages`, the block itself is made in a
// chat) and running on the example-data adapter until the backend exists.
export default async function BlockedMembersPage() {
  requireFlag("messages");
  assertMockAllowed();
  await requireMember();
  let members: BlockedMember[] = [];
  try {
    members = await listBlockedMembers();
  } catch {
    // A list that cannot load reads as empty here; the backend's page owns the error state.
    members = [];
  }
  return <BlockedView members={members} />;
}
