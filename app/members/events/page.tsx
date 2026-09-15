import { getCachedEvents } from "@/components/members/events-data";
import { EventsView } from "@/components/members/events-view";

export default async function MembersEventsPage() {
  const events = await getCachedEvents();
  return <EventsView events={events} />;
}
