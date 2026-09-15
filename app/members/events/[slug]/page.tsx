import { Suspense } from "react";

import {
  EventHero,
  EventDetailBody,
  EventRsvpBar,
} from "@/components/members/event-detail-view";
import { getEventBySlug } from "./get-event";

// EventHero renders synchronously from the shared hero cache (see
// components/members/event-hero-cache.ts) — this page itself does no
// blocking work before returning, so the shared-element view transition
// from the events list has something to morph into immediately instead
// of waiting on the fetches below. EventDetailBody and EventRsvpBar are
// separate Suspense boundaries (not one) so the RSVP bar can stay a
// sibling of <main> rather than nested inside it — see EventRsvpBar's own
// comment in event-detail-view.tsx for why that matters. Both call the
// same cache()-wrapped getEventBySlug, so this is still one Supabase
// round-trip, not two.
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <>
      <main className="relative z-10 flex flex-1 flex-col px-4 pt-8 pb-[150px] sm:px-6 md:pt-28 md:pb-16">
        <EventHero slug={slug} />
        <Suspense fallback={null}>
          <EventBodyLoader slug={slug} />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <EventRsvpBarLoader slug={slug} />
      </Suspense>
    </>
  );
}

async function EventBodyLoader({ slug }: { slug: string }) {
  const { event, bookedCount } = await getEventBySlug(slug);
  return <EventDetailBody event={event} bookedCount={bookedCount} />;
}

async function EventRsvpBarLoader({ slug }: { slug: string }) {
  const { event } = await getEventBySlug(slug);
  return <EventRsvpBar event={event} />;
}
