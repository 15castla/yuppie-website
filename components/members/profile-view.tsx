"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Pencil } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Member } from "@/app/members/require-member";
import { cancelMembership, signOutMember } from "@/app/members/profile/actions";
import { CARD_CLASS, EYEBROW_CLASS, StatusDot, initialsFor } from "./ui";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export type BookingHistoryRow = {
  id: string;
  status: string;
  event: { id: string; title: string; start_time: string } | null;
};

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Never mind",
  onConfirm,
  onClose,
  confirming,
  dismissOnly,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  confirming?: boolean;
  dismissOnly?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-cream p-6 shadow-[0_24px_48px_-16px_rgba(27,21,18,0.5)]">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-foreground-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          {dismissOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
            >
              Got it
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border-2 border-foreground/20 px-5 py-2 text-sm font-bold text-foreground"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={onConfirm}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background disabled:opacity-60"
              >
                {confirming ? "Working…" : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function bookingTag(booking: BookingHistoryRow) {
  if (booking.status === "cancelled") {
    return (
      <span className="shrink-0 rounded-full border border-foreground/20 px-3 py-1 text-xs font-bold text-foreground-muted">
        Cancelled
      </span>
    );
  }

  const isUpcoming = booking.event ? new Date(booking.event.start_time) > new Date() : false;

  return isUpcoming ? (
    <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
      Upcoming
    </span>
  ) : (
    <span className="shrink-0 rounded-full border border-foreground/20 px-3 py-1 text-xs font-bold text-foreground-muted">
      Attended
    </span>
  );
}

export function ProfileView({
  member,
  bookingHistory,
  nextBillingDate,
}: {
  member: Member;
  bookingHistory: BookingHistoryRow[];
  nextBillingDate: string | null;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelResult, setCancelResult] = useState<string | null>(null);
  const [isCancelling, startCancelling] = useTransition();

  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);

  function handleCancelMembership() {
    startCancelling(async () => {
      const result = await cancelMembership();
      setCancelResult(
        result.success
          ? "Your membership will end at the close of your current billing period."
          : (result.error ?? "Something went wrong."),
      );
      if (result.success) router.refresh();
    });
  }

  return (
    <main className="relative z-10 flex flex-1 flex-col px-4 pt-28 pb-[130px] sm:px-6 sm:pt-32 md:pb-20">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <motion.div {...fade(0.1)} className="flex flex-col gap-4">
          <span className={EYEBROW_CLASS}>YOUR PROFILE</span>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.avatar_url}
                  alt={member.full_name ?? member.email}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
                  {initialsFor(member.full_name)}
                </div>
              )}
              <div>
                <p className="text-[17px] font-bold text-foreground">
                  {member.full_name || member.email}
                </p>
                <p className="text-[12.5px] text-foreground-muted">{member.email}</p>
              </div>
            </div>

            <Link
              href="/members/profile/edit"
              aria-label="Edit profile"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background-muted text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

        <motion.section {...fade(0.2)} className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-foreground">Membership</h2>
          <div className={cn(CARD_CLASS, "flex flex-col divide-y divide-foreground/10")}>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Status
              </span>
              <StatusDot status={member.membership_status} />
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Plan
              </span>
              <span className="text-sm font-semibold text-foreground">£10 / month</span>
            </div>
            {nextBillingDate && (
              <div className="flex items-center justify-between p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                  Next billing
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {nextBillingDate}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setCancelDialogOpen(true)}
              className="text-sm font-medium text-foreground/50 underline underline-offset-2 hover:text-foreground"
            >
              Cancel membership
            </button>
          </div>
        </motion.section>

        <motion.section {...fade(0.3)} className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-foreground">Your details</h2>
          <div className={cn(CARD_CLASS, "flex flex-col divide-y divide-foreground/10")}>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Full name
              </span>
              <span className="text-sm text-foreground">{member.full_name || "—"}</span>
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Employer
              </span>
              <span className="text-sm text-foreground">{member.employer || "—"}</span>
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Role
              </span>
              <span className="text-sm text-foreground">{member.role_title || "—"}</span>
            </div>
            <div className="flex items-center justify-between p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Phone
              </span>
              <span className="text-sm text-foreground">{member.phone || "—"}</span>
            </div>
          </div>
        </motion.section>

        <motion.section {...fade(0.4)} className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-foreground">Booking history</h2>
          {bookingHistory.length === 0 ? (
            <div className={cn(CARD_CLASS, "p-5 text-center")}>
              <p className="text-sm text-foreground-muted">No bookings yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {bookingHistory.map((booking) =>
                booking.event ? (
                  <div
                    key={booking.id}
                    className={cn(CARD_CLASS, "flex items-center justify-between gap-4 p-4")}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">
                        {booking.event.title}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {new Date(booking.event.start_time).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    {bookingTag(booking)}
                  </div>
                ) : null,
              )}
            </div>
          )}
        </motion.section>

        <motion.div {...fade(0.5)} className="mt-2">
          <button
            type="button"
            onClick={() => setSignOutDialogOpen(true)}
            className="text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline"
          >
            Sign out
          </button>
        </motion.div>
      </div>

      {signOutDialogOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-background-muted p-6 shadow-[0_24px_48px_-16px_rgba(27,21,18,0.5)]">
            <h3 className="text-base font-bold text-foreground">Sign out?</h3>
            <p className="mt-2 text-sm text-foreground-muted">
              You&apos;ll be signed out and sent back to the main site. You can
              log back in whenever you like.
            </p>
            <div className="mt-6 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setSignOutDialogOpen(false)}
                className="text-sm font-medium text-foreground/50 underline underline-offset-2 hover:text-foreground"
              >
                Cancel
              </button>
              <form action={signOutMember}>
                <button
                  type="submit"
                  className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {cancelDialogOpen && (
        <ConfirmDialog
          title={cancelResult ? "Cancel membership" : "Cancel your membership?"}
          message={
            cancelResult ??
            "You'll lose access at the end of your current billing period. If you want back in after that, you'll need to apply again and go through approval, memberships aren't automatically reinstated."
          }
          confirmLabel="Cancel membership"
          cancelLabel="Keep membership"
          confirming={isCancelling}
          onConfirm={handleCancelMembership}
          dismissOnly={Boolean(cancelResult)}
          onClose={() => {
            setCancelDialogOpen(false);
            setCancelResult(null);
          }}
        />
      )}
    </main>
  );
}
