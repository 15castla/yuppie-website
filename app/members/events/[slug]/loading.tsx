import { EventLoading } from "@/components/members/system/loading-views";

// The event page, loading (r2b section 8, B-D6 C): its own boundary, so going from the list to an event
// shows the event's footprint (back row, picture, title, facts, the price bar on a phone) as pale shapes
// after about 300 ms, rather than leaving the list on screen. main stays aria-busy; nothing spins.
export default function EventDetailLoading() {
  return <EventLoading />;
}
