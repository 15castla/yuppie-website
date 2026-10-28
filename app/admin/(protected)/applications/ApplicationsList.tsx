"use client";

// Applications list (r2b 16): three tabs (Waiting, oldest first, each row flagging the one thing that needs a
// look; Approved; Declined), nine rows then Show more. All caught up when no one is waiting.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyCard } from "@/components/admin/empty-card";
import { agoWords, dayMonth, dayMonthYear } from "@/components/admin/format";
import { MoreLine, PAGE_SIZE, rowsToShow, useListParams } from "@/components/admin/list-controls";
import { useOpenId } from "@/components/admin/split-shell";
import { Avatar, Pill, Tabs } from "@/components/admin/ui";
import { currentTab, tabHref, type AppTab } from "./app-tabs";
import type { AppListRow, PaymentProblem } from "./applications-data";

const FLAG: Record<PaymentProblem, string> = {
  card: "Card declined",
  nocard: "No card saved",
  account: "Account not finished",
  unsaved: "Charged, not saved",
};

export function ApplicationsTabs({ counts }: { counts: Record<AppTab, number> }) {
  const tab = currentTab(useSearchParams().get("tab"));
  return (
    <Tabs
      label="Applications"
      items={[
        { href: tabHref("waiting"), label: "Waiting", count: counts.waiting, current: tab === "waiting" },
        { href: tabHref("approved"), label: "Approved", count: counts.approved, current: tab === "approved" },
        { href: tabHref("declined"), label: "Declined", count: counts.declined, current: tab === "declined" },
      ]}
    />
  );
}

export function ApplicationsList({ rows }: { rows: AppListRow[] }) {
  const { params, update } = useListParams();
  const tab = currentTab(params.get("tab"));
  const openId = useOpenId();
  const asked = Math.max(PAGE_SIZE, Number(params.get("show")) || PAGE_SIZE);
  const inTab = tab === "all" ? rows : rows.filter((r) => r.tab === tab);
  const show = rowsToShow(inTab, asked, openId);
  const visible = inTab.slice(0, show);
  const first = inTab[0]?.id ?? null;
  const qs = new URLSearchParams();
  if (tab !== "waiting") qs.set("tab", tab);
  if (params.get("show")) qs.set("show", String(show));
  const keep = qs.toString() ? `?${qs.toString()}` : "";

  if (!inTab.length) {
    if (tab === "waiting") {
      return (
        <div className="ad-empty-wide">
          <EmptyCard a="All" b="caught up." line="No one is waiting." sub="New applications show up here and on the dashboard." art="tag" />
        </div>
      );
    }
    return (
      <div className="ad-q">
        <div className="ad-nomatch" role="status">
          <b>{tab === "all" ? "No one has applied yet." : tab === "approved" ? "No one has been approved yet." : "No one has been declined."}</b>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="ad-q">
        {visible.map((a) => (
          <Link
            key={a.id}
            className="ad-item"
            href={`/admin/applications/${a.id}${keep}`}
            aria-current={a.id === openId ? "true" : undefined}
            data-default={!openId && a.id === first ? "true" : undefined}
            scroll={false}
          >
            <span className="lead">
              <Avatar name={a.name} />
            </span>
            <span>
              <span className="t">{a.name}</span>
              {a.tab === "waiting" ? (
                a.problem ? (
                  <span className="m flag">{FLAG[a.problem]}</span>
                ) : (
                  <span className="m">{[a.employer, a.role].filter(Boolean).join(" · ") || a.email}</span>
                )
              ) : a.tab === "approved" ? (
                <span className="m">Approved {a.reviewedAt ? dayMonthYear(a.reviewedAt) : ""}</span>
              ) : (
                <span className="m">Declined {a.reviewedAt ? dayMonth(a.reviewedAt) : ""}</span>
              )}
            </span>
            <span className="end">
              {a.tab === "waiting" ? (
                tab === "all" ? <Pill>Waiting</Pill> : <small>{agoWords(a.createdAt)}</small>
              ) : a.tab === "approved" ? (
                <Pill kind="ink">Approved</Pill>
              ) : (
                <Pill kind="muted">Declined</Pill>
              )}
            </span>
          </Link>
        ))}
      </div>
      <MoreLine
        shown={visible.length}
        total={inTab.length}
        onMore={() => update({ show: String(show + PAGE_SIZE) })}
        summary={
          tab === "all"
            ? `${inTab.length} ${inTab.length === 1 ? "application" : "applications"}, all time`
            : tab === "waiting"
              ? `${inTab.length} waiting, oldest first`
              : tab === "declined"
                ? `${inTab.length} declined`
                : `${inTab.length} approved`
        }
      />
    </div>
  );
}
