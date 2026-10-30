import { requireAdmin } from "@/app/admin/require-admin";
import { EventCard } from "../EventCard";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; list?: string; created?: string; warning?: string }>;
}) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
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
