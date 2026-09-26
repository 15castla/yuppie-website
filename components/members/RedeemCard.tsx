"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { getRedemptionStatus, type RedemptionStatus } from "@/app/members/redemption-actions";
import { CARD_CLASS, initialsFor } from "@/components/members/ui";
import { cn } from "@/lib/utils";

type RedeemCardBase = {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  headline: string;
};

export type RedeemCardProps = RedeemCardBase &
  (
    | {
        kind: "discount";
        category: string | null;
        area: string;
        badge: string | null;
      }
    | {
        kind: "access";
        sectionLabel: string;
      }
  );

// A trust display for venue staff, not a redemption system: no QR code,
// no logging, nothing tracked. Membership status is re-fetched fresh
// every time this opens (getRedemptionStatus, see
// app/members/redemption-actions.ts) rather than trusting whatever was
// true when the page first loaded, since a static card is trivially
// screenshotted and handed to someone who isn't a member.
export function RedeemCard(props: RedeemCardProps) {
  const { isOpen, onClose, name, headline } = props;
  const [status, setStatus] = useState<RedemptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setStatus(null);

    let cancelled = false;
    getRedemptionStatus().then((result) => {
      if (!cancelled) {
        setStatus(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const isActive = status?.membership_status === "active";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className={cn(CARD_CLASS, "relative w-full max-w-sm p-6")}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40"
            >
              <X className="h-4 w-4" />
            </button>

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
                <p className="text-sm text-foreground-muted">Checking your membership</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {status?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={status.avatar_url}
                      alt={status.full_name ?? "Member"}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-base font-bold text-background">
                      {initialsFor(status?.full_name ?? null)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-foreground">
                      {status?.full_name || "Member"}
                    </p>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F6B3A]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#2F6B3A]" />
                        Active member
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-foreground-muted">
                        {status?.membership_status ?? "Unknown"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-px bg-foreground/10" />

                <div className="flex flex-col gap-1.5">
                  <p className="text-base font-bold text-foreground">{name}</p>
                  <p className="text-sm text-foreground-muted">
                    {props.kind === "discount"
                      ? [props.category, props.area].filter(Boolean).join(" · ")
                      : props.sectionLabel}
                  </p>
                  <p className="text-sm text-foreground">{headline}</p>
                  {props.kind === "discount" && props.badge && (
                    <span className="mt-1 inline-flex w-fit items-center rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                      {props.badge}
                    </span>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
