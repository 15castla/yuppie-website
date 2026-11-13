"use client";

// The list | card page (B-D4), as a layout: the list stays where it is while the card beside it changes.
// From 768 the two sit side by side (300 | 1fr, 400 | 1fr from 1000). On a phone they are two steps: the list,
// then the card with a Back link (the page head and tabs hide while a card is open). Reports and Photos are
// `stack`ed instead, as approved (B-D22 A): on a phone the list stays above the card and there is no Back link.

import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Icon } from "./icons";

export function SplitShell({
  head,
  list,
  children,
  basePath,
  backLabel,
  keepParams = [],
  fullSegments = [],
  stack = false,
}: {
  head: ReactNode;
  list: ReactNode;
  children: ReactNode;
  basePath: string;
  backLabel: string;
  /** Search params the Back link keeps (the list's search and filter). */
  keepParams?: string[];
  /** Child segments that take the whole width with no list (Access, Feature card). */
  fullSegments?: string[];
  /** On a phone: the list above the card, no Back link (Reports and Photos, B-D22 A). */
  stack?: boolean;
}) {
  const segment = useSelectedLayoutSegment();
  const params = useSearchParams();
  const open = segment !== null;
  const cardRef = useRef<HTMLDivElement>(null);
  // Reports and Photos on a phone: the card is under the whole list, so opening one (or arriving at one from a
  // link) brings its card into view (13 Nov 2026: a report opened from a link showed the list, the card far below).
  useEffect(() => {
    if (!stack || !segment || !cardRef.current) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    cardRef.current.scrollIntoView({ block: "start" });
  }, [stack, segment]);
  const kept = new URLSearchParams();
  for (const key of keepParams) {
    const v = params.get(key);
    if (v) kept.set(key, v);
  }
  const backHref = kept.size ? `${basePath}?${kept.toString()}` : basePath;
  if (segment && fullSegments.includes(segment)) {
    return (
      <div className="ad-page" data-open="false">
        <div className="ad-pagehead">{head}</div>
        <div className="ad-full">{children}</div>
      </div>
    );
  }
  return (
    <div className="ad-page" data-open={open ? "true" : "false"} data-stack={stack ? "true" : undefined}>
      <div className="ad-pagehead">{head}</div>
      <div className="ad-grid" data-open={open ? "true" : "false"}>
        <div className="ad-list-col">{list}</div>
        <div className="ad-card-col" ref={cardRef}>
          <Link className="ad-back" href={backHref} scroll={false}>
            <Icon name="chevron-left" size={22} />
            <span>{backLabel}</span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The selected child segment (a record id, "new"), for highlighting the open row. */
export function useOpenId(): string | null {
  return useSelectedLayoutSegment();
}

/** A link into the area that keeps the list's search and filter. */
export function useKeptHref(keepParams: string[]) {
  const params = useSearchParams();
  return (path: string, extra?: Record<string, string | null>) => {
    const kept = new URLSearchParams();
    for (const key of keepParams) {
      const v = params.get(key);
      if (v) kept.set(key, v);
    }
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (v === null) kept.delete(k);
      else kept.set(k, v);
    }
    return kept.size ? `${path}?${kept.toString()}` : path;
  };
}
