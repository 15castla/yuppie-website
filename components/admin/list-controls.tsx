"use client";

// Search, filter chips and "Show more" for the admin lists (B-D18: search by name or email, nine rows, then
// Show more). The words typed and the filter live in the address (?q=, ?status=, ?show=) through
// history.replaceState, so a reload or the Back link keeps them, without a round trip to the server.

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Icon } from "./icons";

export const PAGE_SIZE = 9;

export function useListParams() {
  const params = useSearchParams();
  const pathname = usePathname();
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }
  return { params, update };
}

/** Lower case, accents off, for matching what was typed. */
export function norm(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search by name or email",
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="ad-search" role="search">
      <Icon name="search" size={20} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button type="button" className="x" aria-label="Clear search" onClick={() => onChange("")}>
          <Icon name="x" size={20} />
        </button>
      )}
    </div>
  );
}

/** The search box's own state, seeded from the address once. */
export function useSearchState(initial: string, onCommit: (value: string) => void) {
  const [q, setQ] = useState(initial);
  return [
    q,
    (value: string) => {
      setQ(value);
      onCommit(value);
    },
  ] as const;
}

export function Chips<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { key: K; label: string; count: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="ad-chips" role="group" aria-label={label}>
      {items.map((c) => (
        <button key={c.key} type="button" className="ad-chip" aria-pressed={c.key === value} onClick={() => onChange(c.key)}>
          {c.label}
          <span className="n">{c.count}</span>
        </button>
      ))}
    </div>
  );
}

/** "Showing 9 of 31" and Show more; or a summary line when everything shows. */
export function MoreLine({
  shown,
  total,
  onMore,
  summary,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  summary?: string;
}) {
  if (shown >= total) {
    return summary ? (
      <div className="ad-more">
        <span>{summary}</span>
      </div>
    ) : null;
  }
  return (
    <div className="ad-more">
      <span aria-live="polite">
        Showing {shown} of {total}
      </span>
      <button type="button" className="ad-link" onClick={onMore}>
        Show more
      </button>
    </div>
  );
}
