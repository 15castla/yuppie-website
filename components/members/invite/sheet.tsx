"use client";

// A bottom sheet on a phone, a centred dialog from 768px. Kit counterpart:
// .sheet + .scrim (the scrim and sheet are position:fixed to the viewport in
// app/members/members.css). Used by the Open Invite moments (success,
// withdraw, report) and by every payment sheet.
//
// Behaviour a design cannot draw: Escape closes, focus moves into the sheet
// and is kept there, the page behind does not scroll, and focus goes back to
// what opened it. The scrim closes it unless `dismissable` is false (a
// payment that is being taken).
//
// needs_device_check: position:fixed sizing against Safari's collapsing
// toolbars, the keyboard pushing a sheet up, the bottom safe area.

import "./invite.css";

import { useEffect, useRef, type ReactNode } from "react";

import { Icon } from "@/components/members/kit";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet({
  labelledBy,
  onClose,
  dismissable = true,
  variant = "oi",
  className,
  children,
}: {
  /** The id of the heading inside, for the dialog's name. */
  labelledBy: string;
  onClose: () => void;
  dismissable?: boolean;
  /** Width and padding on a computer: oi is 480px, pay is 520px. */
  variant?: "oi" | "pay";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const canClose = useRef(dismissable);
  // Keep the latest props for the key handler without re-running the focus effect.
  useEffect(() => {
    closeRef.current = onClose;
    canClose.current = dismissable;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The first thing to act on, else the sheet itself.
    const first = node?.querySelector<HTMLElement>(`${FOCUSABLE}:not([data-sheet-x])`);
    (first ?? node)?.focus({ preventScroll: true });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && canClose.current) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <>
      <div
        className="mk-scrim"
        aria-hidden="true"
        onClick={() => {
          if (dismissable) onClose();
        }}
      />
      <div
        ref={ref}
        className={cn("mk-sheet inv-sheet", variant === "pay" ? "pay-sheet" : "oi-sheet", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-needs-device-check="true"
      >
        <div className="mk-grab" />
        {dismissable ? (
          <button
            type="button"
            className="mk-icon-btn inv-sheet-x"
            aria-label="Close"
            data-sheet-x=""
            onClick={onClose}
          >
            <Icon name="x" size={22} />
          </button>
        ) : null}
        {children}
      </div>
    </>
  );
}
