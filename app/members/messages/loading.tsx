import { InboxView } from "@/components/members/messages/inbox-view";
import { EXAMPLE_NOW } from "@/lib/members/mock/messages";

// The inbox's loading state, as designed: the title and the control are
// already there, one muted line says what is coming, and the <main> is
// aria-busy (no skeleton, no spinner: nothing moves).
export default function MessagesLoading() {
  return <InboxView chats={[]} updates={[]} now={EXAMPLE_NOW} state="loading" />;
}
