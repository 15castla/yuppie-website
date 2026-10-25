// Kit counterpart: k2.pill(text, kind). The 22px outlined pill (RULE-23: 22px
// high, 80px wide at least). kind "ink" is the filled one ("Booked", "Open
// Invite"), "muted" the quiet one ("Past"). The default is outlined ("£25pp",
// "Included", "Full").

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PillKind = "outline" | "ink" | "muted";

export function Pill({
  kind = "outline",
  className,
  children,
}: {
  kind?: PillKind;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "mk-pill",
        kind === "ink" && "mk-ink",
        kind === "muted" && "mk-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

// Kit counterpart: .status (the dot and word on the membership card):
// "ok" green, "warn" amber, "off" muted. Plain words only, never a raw
// status value from the database.
export function Status({
  tone = "ok",
  children,
}: {
  tone?: "ok" | "warn" | "off";
  children: ReactNode;
}) {
  return (
    <span className={cn("mk-status", tone === "warn" && "mk-warn", tone === "off" && "mk-off")}>
      {children}
    </span>
  );
}
