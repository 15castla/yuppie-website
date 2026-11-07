import { InboxView } from "@/components/members/messages/inbox-view";

// The inbox's loading state: the back row and the title, nothing else (the
// loading rule: components/members/kit/main.tsx). The Chats | Updates switch
// keeps its place unseen until the page arrives. The <main> is aria-busy, no
// spinner. There are no rows, so no time is read: the clock is a placeholder.
const NO_CLOCK = "2026-01-01T00:00:00Z";

export default function MessagesLoading() {
  return <InboxView chats={[]} updates={[]} now={NO_CLOCK} state="loading" />;
}
