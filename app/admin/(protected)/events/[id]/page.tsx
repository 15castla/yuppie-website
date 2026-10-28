import { EventCard } from "../EventCard";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; list?: string; created?: string; warning?: string }>;
}) {
  const { id } = await params;
  const { tab, list, created, warning } = await searchParams;
  return (
    <EventCard
      eventId={id}
      tab={tab === "attendees" ? "attendees" : "details"}
      listParam={list === "past" ? "past" : null}
      created={created === "1"}
      warning={warning ?? null}
    />
  );
}
