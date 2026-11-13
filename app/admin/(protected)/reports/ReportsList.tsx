"use client";

// The Reports list (msg-admin-moderation-1280): Open | Done beside the title, then one row per report, newest
// first: the photo of who it is about, their name and where, when, the words reported (two lines at most), then
// the status pill, the reason and who reported it. The open report is marked; on /admin/reports the first one is.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { QueueEmpty } from "@/components/admin/queue";
import { useOpenId } from "@/components/admin/split-shell";
import { Avatar, Pill, Tabs } from "@/components/admin/ui";
import { reportTabHref, STATUS_PILL, type ReportListRow, type ReportTab } from "./report-tabs";

/** The tab: the one in the address, else Done when the open one is done (13 Nov 2026: a done one opened from a link
 *  showed under Open, beside the wrong list). */
function useTab(isDone: (id: string) => boolean): ReportTab {
  const params = useSearchParams();
  const raw = params.get("tab");
  const openId = useOpenId();
  if (raw) return raw === "done" ? "done" : "open";
  // Just acted on here (?done=, ?stale=): stay on the list the admin is working through.
  if (params.get("done") || params.get("stale")) return "open";
  return openId && isDone(openId) ? "done" : "open";
}

export function ReportsTabs({ counts, waitingIds }: { counts: Record<ReportTab, number>; waitingIds: string[] }) {
  // Done is everything not waiting: the Done list only holds the latest 100.
  const tab = useTab((id) => !waitingIds.includes(id));
  return (
    <Tabs
      className="seg"
      label="Reports"
      items={[
        { href: reportTabHref("open"), label: "Open", count: counts.open, current: tab === "open" },
        { href: reportTabHref("done"), label: "Done", count: counts.done, current: tab === "done" },
      ]}
    />
  );
}

export function ReportsList({ open, done }: { open: ReportListRow[]; done: ReportListRow[] }) {
  const tab = useTab((id) => !open.some((r) => r.id === id));
  const openId = useOpenId();
  const rows = tab === "done" ? done : open;
  const keep = tab === "done" ? "?tab=done" : "";

  if (!rows.length) {
    return tab === "done" ? (
      <QueueEmpty title="Nothing done yet.">Reports you act on move here, with what was done.</QueueEmpty>
    ) : (
      <QueueEmpty title="Nothing to review.">
        When a member reports a message, a member, a photo or a plan, it lands here and the club gets an email.
      </QueueEmpty>
    );
  }
  return (
    <div className="ad-q">
      {rows.map((r, i) => {
        const pill = STATUS_PILL[r.status] ?? STATUS_PILL.open;
        return (
          <Link
            key={r.id}
            className="ad-qi"
            href={`/admin/reports/${r.id}${keep}`}
            aria-current={r.id === openId ? "true" : undefined}
            data-default={!openId && i === 0 ? "true" : undefined}
          >
            <Avatar name={r.name} photoUrl={r.photoUrl} size={40} />
            <span className="bd">
              <span className="r1">
                <span className="who">
                  <b>{r.name}</b>
                  {r.context ? ` ${r.context}` : ""}
                </span>
                <span className="ago">{r.ago}</span>
              </span>
              <span className={r.lineIsKind ? "ex kind" : "ex"}>{r.line}</span>
              <span className="mt">
                <Pill kind={pill.kind}>{pill.label}</Pill>
                <span>{r.reason}</span>
                <span>Reported by {r.reporter}</span>
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
