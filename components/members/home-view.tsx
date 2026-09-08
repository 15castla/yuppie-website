"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Percent, Zap } from "lucide-react";

import type { Member } from "@/app/members/require-member";
import type { Event } from "./event-types";
import { MOCK_PERKS } from "./mock-perks";
import {
  CARD_CLASS,
  DateBadge,
  EYEBROW_CLASS,
  MEMBERS_MAIN_CLASS,
  PricePill,
  StatusDot,
  formatEventDayTime,
  initialsFor,
} from "./ui";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export type UpcomingBooking = {
  id: string;
  status: string;
  event: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    location: string;
  } | null;
};

export function HomeView({
  member,
  upcomingBookings,
  pickedEvents,
}: {
  member: Member;
  upcomingBookings: UpcomingBooking[];
  pickedEvents: Event[];
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const firstName = member.full_name?.trim().split(" ")[0] || "there";
  const discountCount = MOCK_PERKS.filter((perk) => perk.type === "discount").length;
  const accessCount = MOCK_PERKS.filter((perk) => perk.type === "access").length;

  return (
    <main className={MEMBERS_MAIN_CLASS}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <motion.div {...fade(0.1)} className="flex items-start justify-between gap-4">
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
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
            {initialsFor(member.full_name)}
          </div>
        </motion.div>

        <motion.div
          {...fade(0.2)}
          className={`${CARD_CLASS} flex items-center p-3.5 px-4`}
        >
          <StatusDot status={member.membership_status} />
        </motion.div>

        <motion.section {...fade(0.3)} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Your upcoming plans</h2>
            <Link
              href="/members/profile"
              className="text-xs font-bold text-foreground/60 underline underline-offset-2 hover:text-foreground"
            >
              See all
            </Link>
          </div>

          {upcomingBookings.length === 0 ? (
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
            <div className="flex flex-col gap-3">
              {upcomingBookings.map((booking) =>
                booking.event ? (
                  <div
                    key={booking.id}
                    className={`${CARD_CLASS} flex items-center gap-4 p-4`}
                  >
                    <DateBadge iso={booking.event.start_time} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {booking.event.title}
                      </p>
                      <p className="truncate text-xs text-foreground-muted">
                        {formatEventDayTime(booking.event.start_time)} ·{" "}
                        {booking.event.location}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                      Booked
                    </span>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </motion.section>

        <motion.section {...fade(0.4)} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Picked for you</h2>
            <Link
              href="/members/events"
              className="text-xs font-bold text-foreground/60 underline underline-offset-2 hover:text-foreground"
            >
              Events
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {pickedEvents.map((event) => (
              <Link
                key={event.id}
                href={`/members/events/${event.id}`}
                className={`${CARD_CLASS} flex items-center justify-between gap-4 p-4 transition-colors hover:border-foreground/25`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {event.title}
                  </p>
                  <p className="truncate text-xs text-foreground-muted">
                    {formatEventDayTime(event.start_time)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
                <PricePill pricePence={event.price_pence} />
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.div {...fade(0.5)} className="grid grid-cols-2 gap-3">
          <Link
            href="/members/discounts"
            className={`${CARD_CLASS} flex flex-col gap-3 p-5 transition-colors hover:border-foreground/25`}
          >
            <Percent className="h-5 w-5 text-foreground" />
            <div>
              <p className="text-sm font-bold text-foreground">
                {discountCount} new discounts
              </p>
              <p className="text-xs text-foreground-muted">Across London this week</p>
            </div>
          </Link>
          <Link
            href="/members/access"
            className={`${CARD_CLASS} flex flex-col gap-3 p-5 transition-colors hover:border-foreground/25`}
          >
            <Zap className="h-5 w-5 text-foreground" />
            <div>
              <p className="text-sm font-bold text-foreground">Skip the queue</p>
              <p className="text-xs text-foreground-muted">
                {accessCount} venues near you
              </p>
            </div>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
