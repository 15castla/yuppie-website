"use client";

// A dialog, drawn as the design's bottom sheet on phones and its centred
// modal from 768px (CSS only; see .yu-dialog in you.css). A native <dialog>
// opened with showModal(), so the browser traps focus, closes it on Escape,
// makes the page behind inert and puts it above the tab bar. Tapping the
// dimmed page closes it too.
//
// Its children are mounted only while it is open, so a form inside starts
// fresh every time. needs_device_check: the sheet and the scrim on a real
// iPhone (position fixed in the top layer, the home indicator inset).

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  labelledBy,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The id of the dialog's heading. */
  labelledBy: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn("yu-dialog", wide && "yu-wide")}
      aria-labelledby={labelledBy}
      data-needs-device-check="true"
      onClose={onClose}
      onClick={(event) => {
        // A tap on the dimmed page is a tap on the <dialog> itself (it has no padding of its own).
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="yu-dialog-body">
          <div className="yu-grab" aria-hidden="true" />
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
