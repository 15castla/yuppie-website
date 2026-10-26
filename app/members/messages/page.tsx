import { InboxView } from "@/components/members/messages/inbox-view";
import { ThreadView } from "@/components/members/messages/thread-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { EXAMPLE_NOW, EXAMPLE_YOU, getThread, listChats, listUpdates } from "@/lib/members/mock/messages";
import type { Chat, ChatThread, UpdateItem } from "@/lib/members/messages/types";
import { ROUTES } from "@/lib/members/routes";
import { requireMember } from "../require-member";

// Messages: the inbox (Chats | Updates). Switched off (flag `messages`) and
// running on the example-data adapter until the backend exists.
export default async function MessagesPage() {
  requireFlag("messages");
  assertMockAllowed();
  await requireMember();

  let chats: Chat[] = [];
  let updates: UpdateItem[] = [];
  let first: ChatThread | null = null;
  let failed = false;
  try {
    [chats, updates] = await Promise.all([listChats(), listUpdates()]);
    // On a computer the inbox sits beside a chat: the newest open one, until the member picks another.
    const newest = chats.find((chat) => chat.status === "open");
    first = newest ? await getThread(newest.id) : null;
  } catch {
    failed = true;
  }

  return (
    <InboxView
      chats={chats}
      updates={updates}
      now={EXAMPLE_NOW}
      state={failed ? "error" : "ready"}
      openChatId={first?.chat.id ?? null}
      pane={first ? <ThreadView thread={first} now={EXAMPLE_NOW} youId={EXAMPLE_YOU.id} /> : null}
      settingsHref={flags.notifications ? ROUTES.youNotifications : null}
      youId={EXAMPLE_YOU.id}
    />
  );
}
