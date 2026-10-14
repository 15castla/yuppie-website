"use client";

import { useState } from "react";

import type { Event } from "@/components/members/event-types";
import {
  CARD_CLASS,
  EVENT_PHOTO_CLASS,
  EventThumbnail,
  PricePill,
  eventFocalPoint,
  formatEventDayTime,
  type FocalPoint,
} from "@/components/members/ui";
import { cn } from "@/lib/utils";
import { FocalPointPicker } from "./FocalPointPicker";

// The per-event "Live preview" card on /admin/events, plus the focal point
// picker for its photo. A client component so the card updates as the
// focal point moves. The chosen point is saved with the rest of the
// event's details: the hidden inputs below belong to that event's details
// form (via the HTML `form` attribute, since that form is elsewhere on the
// page), so its "Save changes" button submits them too.
export function EventPreviewCard({ event, formId }: { event: Event; formId: string }) {
  const [focalPoint, setFocalPoint] = useState<FocalPoint>(() => eventFocalPoint(event));

  return (
    <>
      <div className={cn(CARD_CLASS, "overflow-hidden")}>
        <EventThumbnail
          category={event.category}
          imageUrl={event.image_url}
          focalPoint={focalPoint}
          className={EVENT_PHOTO_CLASS}
        />
        <div className="flex flex-col gap-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-foreground">{event.title}</p>
            <PricePill pricePence={event.price_pence} />
          </div>
          <p className="text-xs text-foreground-muted">
            {formatEventDayTime(event.start_time)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
      </div>
      <p className="text-xs text-foreground/50">
        Same photo shows larger (no card) on the event&apos;s own page.
      </p>

      {event.image_url && (
        <>
          <FocalPointPicker
            imageUrl={event.image_url}
            value={focalPoint}
            onChange={setFocalPoint}
          />
          <input type="hidden" form={formId} name="image_focal_x" value={focalPoint.x} />
          <input type="hidden" form={formId} name="image_focal_y" value={focalPoint.y} />
          <p className="text-xs text-foreground/50">
            Use &ldquo;Save changes&rdquo; to keep a new focal point.
          </p>
        </>
      )}
    </>
  );
}
