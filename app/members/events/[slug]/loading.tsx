import { EventLoading } from "@/components/members/system/loading-views";

// The event page, loading: its own boundary, so going from the list to an event shows the event page's back
// row at once, rather than leaving the list on screen; the rest arrives in one go (the loading rule:
// components/members/kit/main.tsx). main stays aria-busy; nothing spins.
export default function EventDetailLoading() {
  return <EventLoading />;
}
