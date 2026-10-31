import { InboxView } from "@/components/members/messages/inbox-view";

// The inbox's loading state, as designed: the title and the control are
// already there, one muted line says what is coming, and the <main> is
// aria-busy (no skeleton, no spinner: nothing moves). There are no rows, so no
// time is read: the clock is a fixed placeholder.
const NO_CLOCK = "2026-01-01T00:00:00Z";

export default function MessagesLoading() {
  return <InboxView chats={[]} updates={[]} now={NO_CLOCK} state="loading" />;
}
