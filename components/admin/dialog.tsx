"use client";

// The admin dialog (r2b: "a cream-wash scrim and a pale card, a bottom sheet on a phone"). Portalled to <body>
// so nothing on the page (the page-entrance transform, the card's container) can trap it. Escape and the
// close button shut it unless it is busy; focus moves into it and goes back where it was afterwards.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";

export function Dialog({
  open,
  title,
  onClose,
  busy = false,
  children,
  actions,
  testId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children?: ReactNode;
  actions: ReactNode;
  testId?: string;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>("[data-autofocus]") ?? box?.querySelector<HTMLElement>("input, textarea, button:not(.x)");
    (first ?? box)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab" && box) {
        const items = Array.from(box.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), textarea, select, iframe, [tabindex]:not([tabindex='-1'])"));
        if (!items.length) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={cn("ad-layer", almarai.variable, instrumentSerif.variable)}>
      <div className="ad-scrim" aria-hidden="true" onClick={() => !busy && onClose()} />
      <div ref={boxRef} className="ad-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <button className="x" type="button" aria-label="Close" onClick={onClose} disabled={busy}>
          <Icon name="x" size={22} />
        </button>
        <h2 id={titleId} className="ad-h2">
          {title}
        </h2>
        {children}
        <div className="stack">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A tick box row inside a dialog (B-D2: "Also pause … in Stripe", ticked by default). */
export function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="ad-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="bx" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
      <span className="tx">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </span>
    </label>
  );
}

/** A switch row inside a dialog (B-D3: "Send Hannah a decline email", on by default). */
export function SwitchRow({
  on,
  onChange,
  label,
  hint,
  extra,
  disabled,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  extra?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="ad-sw-row">
      <button
        type="button"
        className="ad-sw"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!on)}
      />
      <span className="tx">
        <b id={id}>{label}</b>
        {hint && <span>{hint}</span>}
        {extra}
      </span>
    </div>
  );
}

/** The email a person will get, word for word (rendered by lib/emails on the server), behind "Read the email". */
export function MailFrame({ html, title }: { html: string; title: string }) {
  return <iframe className="ad-mailframe" title={title} srcDoc={html} sandbox="" />;
}
