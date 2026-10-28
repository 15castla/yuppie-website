"use client";

// Members list (r2b 15): search as you type (name or email), All / Active / Paused / Cancelled with counts,
// nine rows, then Show more (B-D18). The open member is marked.

import Link from "next/link";
import { useState } from "react";

import { Chips, MoreLine, PAGE_SIZE, SearchBox, norm, useListParams, useSearchState } from "@/components/admin/list-controls";
import { useKeptHref, useOpenId } from "@/components/admin/split-shell";
import { Avatar, StatusPill } from "@/components/admin/ui";
import type { MemberListRow } from "./members-data";

type Filter = "all" | "active" | "paused" | "cancelled";
const FILTERS: Filter[] = ["all", "active", "paused", "cancelled"];

export function MembersList({ rows }: { rows: MemberListRow[] }) {
  const { params, update } = useListParams();
  const href = useKeptHref(["q", "status", "show"]);
  const openId = useOpenId();
  // The card beside the list on /admin/members is the first member for the search and filter the page
  // opened with; mark it only while those are unchanged.
  const [openedWith] = useState(() => `${params.get("q") ?? ""}|${params.get("status") ?? ""}`);
  const status = (FILTERS as string[]).includes(params.get("status") ?? "") ? (params.get("status") as Filter) : "all";
  const show = Math.max(PAGE_SIZE, Number(params.get("show")) || PAGE_SIZE);
  const [q, setQ] = useSearchState(params.get("q") ?? "", (value) => update({ q: value || null, show: null }));

  const needle = norm(q);
  const inFilter = rows.filter((r) => status === "all" || r.status === status);
  const hits = needle ? inFilter.filter((r) => norm(r.name).includes(needle) || norm(r.email).includes(needle)) : inFilter;
  const visible = hits.slice(0, show);
  const count = (f: Filter) => (f === "all" ? rows.length : rows.filter((r) => r.status === f).length);

  return (
    <div>
      <div className="ad-tools">
        <SearchBox value={q} onChange={setQ} label="Search members by name or email" />
        <Chips
          label="Show members"
          value={status}
          onChange={(f) => update({ status: f === "all" ? null : f, show: null })}
          items={[
            { key: "all", label: "All", count: count("all") },
            { key: "active", label: "Active", count: count("active") },
            { key: "paused", label: "Paused", count: count("paused") },
            { key: "cancelled", label: "Cancelled", count: count("cancelled") },
          ]}
        />
      </div>
      <div className="ad-q">
        {visible.length === 0 ? (
          <div className="ad-nomatch" role="status">
            {needle ? (
              <>
                <b>No one matches “{q.trim()}”.</b>
                <p>Check the spelling, or try their email address.</p>
              </>
            ) : (
              <>
                <b>No members here yet.</b>
                <p>Members show up here once their application is approved.</p>
              </>
            )}
          </div>
        ) : (
          visible.map((m) => (
            <Link key={m.id} className="ad-item" href={href(`/admin/members/${m.id}`)} aria-current={m.id === openId ? "true" : undefined} data-default={!openId && openedWith === `${q}|${params.get("status") ?? ""}` && m.id === visible[0]?.id ? "true" : undefined} scroll={false}>
              <span className="lead">
                <Avatar name={m.name} photoUrl={m.photoUrl} />
              </span>
              <span>
                <span className="t">{m.name}</span>
                <span className="m">{m.email}</span>
              </span>
              <span className="end">
                <StatusPill status={m.status} />
              </span>
            </Link>
          ))
        )}
      </div>
      {needle && visible.length > 0 && hits.length <= show ? (
        <div className="ad-more" aria-live="polite">
          <span>
            {hits.length} of {rows.length} match
          </span>
        </div>
      ) : (
        <MoreLine shown={visible.length} total={hits.length} onMore={() => update({ show: String(show + PAGE_SIZE) })} />
      )}
    </div>
  );
}
