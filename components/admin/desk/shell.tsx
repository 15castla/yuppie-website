import Link from "next/link";
import type { ReactNode } from "react";

import { DONE_WORDS, ERROR_WORDS } from "@/lib/server/outreach/model";
import { longDay, timeWords } from "./format";

// The Outreach Desk's frame (17 Nov 2026): the dark main under the admin bar, the title with today's date, a
// search for a partner (for an impromptu meeting), New partner, the desk's tabs and the line saying what just
// happened (?done= / ?error=).

export type DeskTab = "desk" | "today" | "partners" | "settings";

const TABS: { key: DeskTab; href: string; label: string }[] = [
  { key: "desk", href: "/admin/desk", label: "Blotter" },
  { key: "today", href: "/admin/desk/today", label: "Today" },
  { key: "partners", href: "/admin/desk/partners", label: "Partners" },
  { key: "settings", href: "/admin/desk/settings", label: "Settings" },
];

export type SearchParams = Record<string, string | string[] | undefined>;

export function one(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function Flash({ sp }: { sp: SearchParams }) {
  const done = one(sp, "done");
  const error = one(sp, "error");
  if (error) {
    return (
      <p className="dk-flash err" role="alert">
        {ERROR_WORDS[error] ?? ERROR_WORDS.failed}
      </p>
    );
  }
  if (done && DONE_WORDS[done]) {
    return (
      <p className="dk-flash ok" role="status">
        {DONE_WORDS[done]}
      </p>
    );
  }
  return null;
}

export function DeskShell({ current, sp, children, right }: { current: DeskTab | null; sp: SearchParams; children: ReactNode; right?: ReactNode }) {
  const now = new Date();
  return (
    <main className="dk">
      <div className="dk-wrap">
        <div className="dk-top">
          <h1 className="dk-title">Outreach desk</h1>
          <p className="dk-meta">
            <span>
              <b>{longDay(now)}</b> {timeWords(now.toISOString())}
            </span>
          </p>
          <div className="dk-top-r">
            {right}
            <form className="dk-search" action="/admin/desk/partners" role="search">
              <label className="dk-sr" htmlFor="dk-find">
                Find a partner
              </label>
              <input id="dk-find" type="search" name="q" placeholder="Find a partner" defaultValue={current === "partners" ? (one(sp, "q") ?? "") : ""} />
            </form>
            <Link className="dk-btn primary" href="/admin/desk/new">
              New partner
            </Link>
          </div>
        </div>
        <nav className="dk-tabs" aria-label="Desk">
          {TABS.map((t) => (
            <Link key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <Flash sp={sp} />
        {children}
      </div>
    </main>
  );
}
