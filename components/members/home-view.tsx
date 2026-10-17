"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Key, Percent } from "lucide-react";

import type { Member } from "@/app/members/require-member";
import type { Event } from "./event-types";
import { EventRowList } from "./event-row";
import {
  CARD_CLASS,
  EYEBROW_CLASS,
  MEMBERS_MAIN_CLASS,
  StatusDot,
  initialsFor,
  fadeIn,
} from "./ui";

export type UpcomingBooking = {
  id: string;
  status: string;
  event: Event | null;
};

export function HomeView({
  member,
  upcomingBookings,
  pickedEvents,
  hasUpcomingEvents,
}: {
  member: Member;
  upcomingBookings: UpcomingBooking[];
  pickedEvents: Event[];
  hasUpcomingEvents: boolean;
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => fadeIn(reduce, delay);

  const firstName = member.full_name?.trim().split(" ")[0] || "there";

  // Every row in "Your upcoming plans" is a confirmed booking.
  const upcomingEvents = upcomingBookings.flatMap((booking) => (booking.event ? [booking.event] : []));
  const upcomingEventIds = new Set(upcomingEvents.map((event) => event.id));

  return (
    <main className={MEMBERS_MAIN_CLASS}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <motion.div {...fade(0)} className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <span className={EYEBROW_CLASS}>MEMBERS AREA</span>
            <h1 className="text-2xl font-extrabold leading-[1.05] text-foreground sm:text-3xl optical-trim">
              Hey, {firstName}.
              <br />
              <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
                What&apos;s on this week?
              </em>
            </h1>
          </div>
          <Link
            href="/members/profile"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Go to your profile"
          >
            {initialsFor(member.full_name)}
          </Link>
        </motion.div>

        <motion.div
          {...fade(0.03)}
          className={`${CARD_CLASS} flex items-center p-3.5 px-4`}
        >
          <StatusDot status={member.membership_status} />
        </motion.div>

        <motion.section {...fade(0.06)} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Your upcoming plans</h2>
            <Link
              href="/members/profile"
              className="text-xs font-bold text-foreground/70 underline underline-offset-2 hover:text-foreground"
            >
              See all
            </Link>
          </div>

          {upcomingEvents.length === 0 ? (
            <div className={`${CARD_CLASS} p-5 text-center`}>
              <p className="text-sm text-foreground-muted">
                Nothing booked yet.{" "}
                <Link
                  href="/members/events"
                  className="font-bold text-foreground underline underline-offset-2"
                >
                  Browse Events
                </Link>
              </p>
            </div>
          ) : (
            <EventRowList
              events={upcomingEvents}
              bookedEventIds={upcomingEventIds}
              showThumbnails={false}
            />
          )}
        </motion.section>

        <motion.section {...fade(0.09)} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Picked for you</h2>
            <Link
              href="/members/events"
              className="text-xs font-bold text-foreground/70 underline underline-offset-2 hover:text-foreground"
            >
              All events
            </Link>
          </div>

          {pickedEvents.length === 0 ? (
            <div className={`${CARD_CLASS} p-5 text-center`}>
              <p className="text-sm text-foreground-muted">
                {hasUpcomingEvents
                  ? "You're booked on everything coming up."
                  : "No events lined up yet. Check back soon."}
              </p>
            </div>
          ) : (
            // Never includes an event the member has booked (see
            // app/members/page.tsx), so no row here is "Booked".
            <EventRowList events={pickedEvents} bookedEventIds={new Set()} showThumbnails={false} />
          )}
        </motion.section>

        <motion.div {...fade(0.12)} className="grid grid-cols-2 gap-3">
          <Link
            href="/members/discounts"
            className={`${CARD_CLASS} flex flex-col gap-3 p-5 transition-colors hover:border-foreground/25`}
          >
            <Percent className="h-5 w-5 text-foreground" />
            <div>
              <p className="text-sm font-bold text-foreground">Discounts</p>
              <p className="text-xs text-foreground-muted">
                Partner offers across London
              </p>
            </div>
          </Link>
          <Link
            href="/members/access"
            className={`${CARD_CLASS} flex flex-col gap-3 p-5 transition-colors hover:border-foreground/25`}
          >
            {/* Same icon as the bottom nav's Access tab (members-nav.tsx). */}
            <Key className="h-5 w-5 text-foreground" />
            <div>
              <p className="text-sm font-bold text-foreground">Access</p>
              <p className="text-xs text-foreground-muted">
                Clubs, queue-skips &amp; more
              </p>
            </div>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
