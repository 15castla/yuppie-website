import { notFound } from "next/navigation";

import { InboxView } from "@/components/members/messages/inbox-view";
import { ThreadView } from "@/components/members/messages/thread-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import { getThread, listChats, markChatRead } from "@/lib/server/chats";
import { listUpdates } from "@/lib/server/updates";
import { requireMember } from "../../require-member";

// One chat: a plan chat or a question, real data. "ask-<plan id>" is a question not asked yet (the first send
// makes it). A chat that is not the member's is a 404. Opening it reads it (after the "N new messages" divider
// is worked out); the thread's polling and sending are app/members/messages/[chatId]/actions.ts.
export default async function MessageThreadPage({ params }: { params: Promise<{ chatId: string }> }) {
  requireFlag("messages");
  const member = await requireMember();
  const { chatId } = await params;
  const now = new Date();
  const thread = await getThread({ id: member.id, email: member.email }, decodeURIComponent(chatId), now);
  if (!thread) notFound();
  if (!thread.chat.id.startsWith("ask-")) await markChatRead(member.id, thread.chat.id);
  const [chats, updates] = await Promise.all([listChats(member.id, now), listUpdates(member.id, now)]);

  return (
    <InboxView
      mode="thread"
      chats={chats}
      updates={updates}
      now={now.toISOString()}
      openChatId={thread.chat.id}
      pane={<ThreadView key={thread.chat.id} thread={thread} now={now.toISOString()} youId={member.id} />}
      settingsHref={flags.notifications ? ROUTES.youNotifications : null}
      youId={member.id}
    />
  );
}
