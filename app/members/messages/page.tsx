import { InboxView } from "@/components/members/messages/inbox-view";
import { ThreadView } from "@/components/members/messages/thread-view";
import { flags, requireFlag } from "@/lib/members/flags";
import type { Chat, ChatThread, UpdateItem } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import { getThread, listChats } from "@/lib/server/chats";
import { listUpdates } from "@/lib/server/updates";
import { requireMember } from "../require-member";

// Messages: the inbox (Chats | Updates), real data (lib/server/chats.ts, updates.ts). On a computer the newest
// open chat sits beside the list. Refreshing while open is the screen's (app/members/messages/actions.ts).
export default async function MessagesPage() {
  requireFlag("messages");
  const member = await requireMember();
  const viewer = { id: member.id, email: member.email };
  const now = new Date();

  let chats: Chat[] = [];
  let updates: UpdateItem[] = [];
  let first: ChatThread | null = null;
  let failed = false;
  try {
    [chats, updates] = await Promise.all([listChats(member.id, now), listUpdates(member.id, now)]);
    const newest = chats.find((chat) => chat.status === "open");
    first = newest ? await getThread(viewer, newest.id, now) : null;
  } catch (err) {
    console.error(`messages: the inbox failed for member ${member.id}:`, err);
    failed = true;
  }

  return (
    <InboxView
      chats={chats}
      updates={updates}
      now={now.toISOString()}
      state={failed ? "error" : "ready"}
      openChatId={first?.chat.id ?? null}
      pane={first ? <ThreadView thread={first} now={now.toISOString()} youId={member.id} /> : null}
      settingsHref={flags.notifications ? ROUTES.youNotifications : null}
      youId={member.id}
    />
  );
}
