"use server";

// The number on the messages icon, from one source (messages decision 8 A): unread chats plus unread updates
// (lib/server/chats.ts unreadCounts, the database's unread_counts). The shell asks for it when the page
// changes and on a slow timer while an Open Invite page is open (components/members/shell/use-unread.ts);
// the icon shows "9+" over 9. Zero when Messages is off or there is no member.

import { flags } from "@/lib/members/flags";
import { unreadCounts } from "@/lib/server/chats";
import { getMember } from "./require-member";

export async function getMessagesBadge(): Promise<number> {
  if (!flags.messages) return 0;
  const member = await getMember();
  if (!member) return 0;
  try {
    const counts = await unreadCounts(member.id);
    return counts.chats + counts.updates;
  } catch (err) {
    console.error(`getMessagesBadge failed for member ${member.id}:`, err);
    return 0;
  }
}
