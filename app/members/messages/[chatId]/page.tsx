import { notFound } from "next/navigation";

import { InboxView } from "@/components/members/messages/inbox-view";
import { ThreadView } from "@/components/members/messages/thread-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { EXAMPLE_NOW, EXAMPLE_YOU, getThread, listChats, listUpdates } from "@/lib/members/mock/messages";
import { ROUTES } from "@/lib/members/routes";
import { requireMember } from "../../require-member";

// One chat: a plan chat or a question. On a phone it fills the screen (its own
// header and composer, no tab bar); from 1024px it sits beside the inbox.
export default async function MessageThreadPage({ params }: { params: Promise<{ chatId: string }> }) {
  requireFlag("messages");
  assertMockAllowed();
  await requireMember();

  const { chatId } = await params;
  const [thread, chats, updates] = await Promise.all([getThread(chatId), listChats(), listUpdates()]);
  if (!thread) notFound();

  return (
    <ExampleScope>
      <InboxView
        mode="thread"
        chats={chats}
        updates={updates}
        now={EXAMPLE_NOW}
        openChatId={thread.chat.id}
        pane={<ThreadView key={thread.chat.id} thread={thread} now={EXAMPLE_NOW} youId={EXAMPLE_YOU.id} />}
        settingsHref={flags.notifications ? ROUTES.youNotifications : null}
        youId={EXAMPLE_YOU.id}
      />
    </ExampleScope>
  );
}
