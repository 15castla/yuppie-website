"use client";

// Small client pieces: a banner whose raw text sits behind Details, a copy button, and a busy-aware button.

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Icon } from "./icons";

/** r2b banners: one plain sentence and what to do; the raw text (Stripe's, the database's) behind Details. */
export function Banner({
  title,
  children,
  raw,
  info = false,
  className,
}: {
  title: string;
  children?: ReactNode;
  raw?: string | null;
  info?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("ad-banner", info && "info", className)} role={info ? "status" : "alert"}>
      <Icon name={info ? "info" : "circle-alert"} size={20} />
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
      {raw && (
        <div className="more">
          <button type="button" className="ad-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide details" : "Details"}
          </button>
          {open && <p className="raw">{raw}</p>}
        </div>
      )}
    </div>
  );
}

/** "We couldn’t save that." with the server's own words behind Details (r2b 20). */
export function SaveFailed({ raw, title = "We couldn’t save that." }: { raw?: string | null; title?: string }) {
  const plainStripe = raw && /^Stripe /.test(raw);
  return (
    <Banner title={title} raw={plainStripe ? null : raw}>
      {plainStripe ? raw : "Your changes are still here. Try again in a moment."}
    </Banner>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <span className="ad-copy">
      <span>{value}</span>
      <button type="button" onClick={copy} aria-label={copied ? `${label} copied` : `Copy ${label}`} title={copied ? "Copied" : "Copy"}>
        <Icon name={copied ? "check" : "copy"} size={18} />
      </button>
    </span>
  );
}

/**
 * A kit button that runs something: while busy it keeps its colour and height and the label changes
 * ("Saving…"), aria-busy, no spinner (r2b button states).
 */
export function BusyButton({
  busy,
  busyLabel,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel: string }) {
  return (
    <button {...rest} className={cn("ad-btn", className)} disabled={busy || disabled} aria-busy={busy || undefined}>
      {busy ? busyLabel : children}
    </button>
  );
}
