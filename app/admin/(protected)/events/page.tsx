import { EventCard } from "./EventCard";
import { currentListTab, eventsIn } from "./event-list-types";
import { listEvents } from "./events-data";

// /admin/events: from 768 the first event in the list shows beside it (soonest coming up, or the latest past).
export default async function EventsIndexPage({ searchParams }: { searchParams: Promise<{ list?: string; tab?: string }> }) {
  const { list, tab } = await searchParams;
  const first = eventsIn(await listEvents(), currentListTab(list))[0];
  if (!first) return null;
  return <EventCard eventId={first.id} tab={tab === "attendees" ? "attendees" : "details"} listParam={list === "past" ? "past" : null} />;
}
