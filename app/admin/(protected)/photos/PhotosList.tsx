"use client";

// The Photos list (photo-admin-queue-1280): To check | Done beside the title, then one row per photo: the photo,
// the member's name, a pill (Reported, New, Changed), when, and one line under it. Reported photos are at the
// top. The open photo is marked; on /admin/photos the first one is.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { QueueEmpty } from "@/components/admin/queue";
import { useOpenId } from "@/components/admin/split-shell";
import { Avatar, Pill, Tabs } from "@/components/admin/ui";
import { photoTabHref, type PhotoListRow, type PhotoTab } from "./photo-tabs";

function useTab(): PhotoTab {
  return useSearchParams().get("tab") === "done" ? "done" : "check";
}

export function PhotosTabs({ counts }: { counts: Record<PhotoTab, number> }) {
  const tab = useTab();
  return (
    <Tabs
      className="seg"
      label="Photos"
      items={[
        { href: photoTabHref("check"), label: "To check", count: counts.check || null, current: tab === "check" },
        { href: photoTabHref("done"), label: "Done", count: counts.done, current: tab === "done" },
      ]}
    />
  );
}

export function PhotosList({ check, done }: { check: PhotoListRow[]; done: PhotoListRow[] }) {
  const tab = useTab();
  const openId = useOpenId();
  const rows = tab === "done" ? done : check;
  const keep = tab === "done" ? "?tab=done" : "";

  if (!rows.length) {
    return tab === "done" ? (
      <QueueEmpty title="Nothing checked lately.">Photos you keep or remove show here for 30 days.</QueueEmpty>
    ) : (
      <QueueEmpty title="Nothing to check.">New and changed photos land here as members add them. Reported photos jump to the top.</QueueEmpty>
    );
  }
  return (
    <div className="ad-q" role="list" aria-label={tab === "done" ? "Photos checked" : "Photos to check"}>
      {rows.map((r, i) => (
        <Link
          key={r.photoId}
          role="listitem"
          className="ad-qi ph"
          href={`/admin/photos/${r.photoId}${keep}`}
          aria-current={r.photoId === openId ? "true" : undefined}
          data-default={!openId && i === 0 ? "true" : undefined}
        >
          <Avatar name={r.name} photoUrl={r.photoUrl} size={48} />
          <span className="bd">
            <span className="r1">
              <span className="who">{r.name}</span>
              <Pill kind={r.pill.kind}>{r.pill.label}</Pill>
              <span className="ago">{r.ago}</span>
            </span>
            <span className="ex">{r.line}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
