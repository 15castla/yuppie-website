import "server-only";

// Events for the admin list and card, read with the service role after requireAdmin().

import { cache } from "react";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import type { EventListRow } from "./event-list-types";

export type { EventListRow };

export const listEvents = cache(async function listEvents(): Promise<EventListRow[]> {
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const [{ data: events, error }, { data: bookings }] = await Promise.all([
    db.from("events").select("id, slug, title, start_time, location, capacity, price_pence, cancelled_at").order("start_time", { ascending: true }).order("id", { ascending: true }),
    db.from("bookings").select("event_id").eq("status", "confirmed"),
  ]);
  if (error) throw new Error(`events list: ${error.message}`);
  const booked = new Map<string, number>();
  for (const b of bookings ?? []) booked.set(b.event_id as string, (booked.get(b.event_id as string) ?? 0) + 1);
  const now = Date.now();
  return (events ?? []).map((e) => ({
    id: e.id as string,
    slug: e.slug as string,
    title: e.title as string,
    startTime: e.start_time as string,
    location: (e.location as string | null) ?? null,
    capacity: (e.capacity as number | null) ?? null,
    pricePence: (e.price_pence as number) ?? 0,
    cancelled: Boolean(e.cancelled_at),
    past: new Date(e.start_time as string).getTime() < now,
    booked: booked.get(e.id as string) ?? 0,
  }));
});
