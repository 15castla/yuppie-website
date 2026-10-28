import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { Banner } from "@/components/admin/bits";
import { dayDate, dayDateTime, pounds, time24 } from "@/components/admin/format";
import { Card, DL, Pill, Tabs } from "@/components/admin/ui";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { eventFocalPoint } from "@/components/members/ui";
import { renderEmail } from "@/lib/emails";
import { getEventAddress, listAttendees } from "@/lib/server/events";
import { isoToDateTimeLocal } from "@/lib/utils";
import { Attendees, type AttendeeView } from "./Attendees";
import { CancelEvent } from "./CancelEvent";
import { EventForm } from "./EventForm";

// The event card (r2b 17): Details (the form, the picture, how members see it, Save and Cancel event) and
// Attendees (the count, who booked, the cancelled people, Export list). Past and cancelled events are locked.

const TZ = "Europe/London";
const CATEGORY: Record<string, string> = { sport: "Sport", entertainment: "Entertainment", personal_progression: "Personal progression" };

type EventRow = Event & { cancelled_at: string | null; cancel_note: string | null };

function Capacity({ booked, capacity, right }: { booked: number; capacity: number | null; right: string }) {
  const cap = capacity ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((booked / cap) * 100)) : 0;
  return (
    <div style={{ marginTop: 20 }}>
      <div className="ad-big">
        <span className="n">
          {booked}
          {capacity !== null && <small> / {capacity}</small>}
        </span>
        <span className="r">{right}</span>
      </div>
      {capacity !== null && (
        <div className="ad-meter" role="img" aria-label={`${booked} of ${capacity} booked`}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export async function EventCard({
  eventId,
  tab,
  listParam,
  created = false,
  warning = null,
}: {
  eventId: string;
  tab: "details" | "attendees";
  listParam: string | null;
  created?: boolean;
  warning?: string | null;
}) {
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const { data } = await db.from("events").select(`${EVENT_COLUMNS}, cancelled_at, cancel_note`).eq("id", eventId).maybeSingle();
  const event = data as EventRow | null;
  if (!event) notFound();

  const [address, list] = await Promise.all([getEventAddress(event.id), listAttendees(event.id)]);
  const booked = list.confirmedCount;
  const past = new Date(event.start_time).getTime() < Date.now();
  const cancelled = Boolean(event.cancelled_at);
  const full = !cancelled && !past && event.capacity !== null && booked >= event.capacity;
  const when = `${dayDateTime(event.start_time)}${event.location ? ` · ${event.location}` : ""}`;
  const left = event.capacity !== null ? Math.max(0, event.capacity - booked) : null;
  const right = cancelled ? "Cancelled" : past ? "Finished" : left === 0 ? "Full. No places left." : left === null ? "booked" : left === 1 ? "1 place left" : `${left} places left`;

  const qs = (t: "details" | "attendees") => {
    const p = new URLSearchParams();
    if (listParam) p.set("list", listParam);
    if (t === "attendees") p.set("tab", "attendees");
    const s = p.toString();
    return `/admin/events/${event.id}${s ? `?${s}` : ""}`;
  };
  const headId = `event-${event.id}`;
  const head = (
    <>
      <div className="ad-dh">
        <div className="tt">
          <h2 id={headId} className="ad-h2">
            {event.title}
          </h2>
          <p className="sub">{when}</p>
        </div>
        {cancelled ? <Pill kind="muted">Cancelled</Pill> : past ? <Pill kind="muted">Finished</Pill> : full ? <Pill>Full</Pill> : <Pill kind="ink">Open</Pill>}
      </div>
      <Tabs
        label="Event"
        items={[
          { href: qs("details"), label: "Details", current: tab === "details" },
          { href: qs("attendees"), label: "Attendees", count: booked, current: tab === "attendees" },
        ]}
      />
    </>
  );

  if (tab === "attendees") {
    const attendees: AttendeeView[] = list.attendees.map((a) => ({
      bookingId: a.bookingId,
      name: a.name,
      email: a.email,
      confirmed: a.status === "confirmed",
      bookedAt: a.bookedAt,
      cancelledAt: a.cancelledAt,
      amountPence: a.amountPence,
      refund: a.refundStatus,
      refundPence: a.refundPence,
    }));
    return (
      <Card labelledBy={headId}>
        {head}
        <Capacity booked={booked} capacity={event.capacity} right={right} />
        <Attendees eventId={event.id} attendees={attendees} />
      </Card>
    );
  }

  const locked = (
    <DL
      rows={[
        ["Starts", dayDateTime(event.start_time)],
        ["Location", event.location],
        ["Address", address],
        ["Category", CATEGORY[event.category] ?? event.category],
        ["Price", event.price_pence > 0 ? `${pounds(event.price_pence)} per person` : "Included"],
        ["Capacity", String(event.capacity)],
      ]}
    />
  );

  if (cancelled) {
    const byClub = list.attendees.filter((a) => a.cancelReason === "event_cancelled");
    const refunded = byClub.filter((a) => a.refundStatus === "succeeded" || a.refundStatus === "pending").length;
    const failed = byClub.filter((a) => a.refundStatus === "failed").length;
    const { count: emailed } = await db.from("message_log").select("*", { count: "exact", head: true }).eq("event_id", event.id).eq("template", "event-cancelled").eq("status", "sent");
    const n = byClub.length;
    return (
      <Card labelledBy={headId}>
        {head}
        <Capacity booked={booked} capacity={event.capacity} right={right} />
        <Banner title="This event is cancelled." info>
          {`Cancelled on ${dayDate(event.cancelled_at as string)}${event.cancel_note ? `, because ${event.cancel_note.replace(/^because\s+/i, "").replace(/\.$/, "")}` : ""}. `}
          {n === 0
            ? "Nobody was booked."
            : `${n === 1 ? "1 person was" : `${n} people were`} booked: ${emailed ?? 0} emailed${refunded ? `, ${refunded} refunded` : ""}.`}{" "}
          Members can’t book it.
        </Banner>
        {failed > 0 && (
          <Banner title={`${failed === 1 ? "1 refund" : `${failed} refunds`} didn’t go through.`}>
            Refund {failed === 1 ? "it" : "them"} by hand in Stripe. The club inbox has the details.
          </Banner>
        )}
        {locked}
      </Card>
    );
  }

  if (past) {
    return (
      <Card labelledBy={headId}>
        {head}
        <Capacity booked={booked} capacity={event.capacity} right={right} />
        <Banner title="This event has finished." info>
          The details are locked. You can still see who booked and export the list.
        </Banner>
        {locked}
      </Card>
    );
  }

  const confirmed = list.attendees.filter((a) => a.status === "confirmed");
  const paidRows = confirmed.filter((a) => a.amountPence > 0);
  const refundTotal = paidRows.reduce((sum, a) => sum + a.amountPence, 0);
  const amounts = new Set(paidRows.map((a) => a.amountPence));
  const perPerson = amounts.size === 1 ? [...amounts][0] : null;
  const start = { date: dayDate(event.start_time), time: time24(event.start_time) };
  const mail = renderEmail("event-cancelled", {
    event: { title: event.title, start },
    reason: null,
    refund: paidRows.length ? { amount: pounds(perPerson ?? paidRows[0].amountPence), card: null } : null,
  });

  return (
    <Card labelledBy={headId}>
      {head}
      <Capacity booked={booked} capacity={event.capacity} right={right} />
      {warning && <Banner title="The event was made, but the picture wasn’t added.">{warning}</Banner>}
      <EventForm
        key={event.id}
        mode="edit"
        eventId={event.id}
        slug={event.slug}
        booked={booked}
        imageUrl={event.image_url}
        focal={eventFocalPoint(event)}
        linkHost="clubyuppie.com"
        created={created}
        initial={{
          title: event.title,
          category: event.category,
          location: event.location ?? "",
          address: address ?? "",
          start: isoToDateTimeLocal(event.start_time, TZ),
          end: event.end_time ? isoToDateTimeLocal(event.end_time, TZ) : "",
          price: event.price_pence ? (event.price_pence / 100).toFixed(2).replace(/\.00$/, "") : "0",
          capacity: String(event.capacity ?? ""),
          description: event.description ?? "",
        }}
        extraActions={
          <CancelEvent
            eventId={event.id}
            title={event.title}
            booked={booked}
            paid={paidRows.length}
            refundTotal={refundTotal}
            perPerson={perPerson}
            preview={{ subject: mail.subject, preheader: mail.preheader }}
          />
        }
      />
    </Card>
  );
}
