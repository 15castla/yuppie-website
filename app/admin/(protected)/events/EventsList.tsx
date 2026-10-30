"use client";

// Events list (r2b 17): Coming up (soonest first) and Past (read only), each row with its date, time and
// place and how full it is.

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { EmptyCard } from "@/components/admin/empty-card";
import { dateParts, time24 } from "@/components/admin/format";
import { MoreLine, PAGE_SIZE, rowsToShow, useListParams } from "@/components/admin/list-controls";
import { useOpenId } from "@/components/admin/split-shell";
import { DateCol, Pill, Tabs } from "@/components/admin/ui";
import { currentListTab, eventsIn, type EventListRow } from "./event-list-types";

export function EventsTabs({ counts }: { counts: { coming: number; past: number } }) {
  const tab = currentListTab(useSearchParams().get("list"));
  return (
    <Tabs
      label="Events"
      items={[
        { href: "/admin/events", label: "Coming up", count: counts.coming, current: tab === "coming" },
        { href: "/admin/events?list=past", label: "Past", count: counts.past, current: tab === "past" },
      ]}
    />
  );
}

function EndOf({ e }: { e: EventListRow }) {
  if (e.cancelled) return <Pill kind="muted">Cancelled</Pill>;
  if (e.past) return <Pill kind="muted">Finished</Pill>;
  if (e.capacity !== null && e.booked >= e.capacity) return <Pill>Full</Pill>;
  return <span>{e.capacity !== null ? `${e.booked} of ${e.capacity}` : `${e.booked} booked`}</span>;
}

export function EventsList({ rows }: { rows: EventListRow[] }) {
  const { params, update } = useListParams();
  const tab = currentListTab(params.get("list"));
  const openId = useOpenId();
  const asked = Math.max(PAGE_SIZE, Number(params.get("show")) || PAGE_SIZE);
  const inTab = eventsIn(rows, tab);
  const show = rowsToShow(inTab, asked, openId);
  const visible = inTab.slice(0, show);
  const first = inTab[0]?.id ?? null;
  const qs = new URLSearchParams();
  if (tab === "past") qs.set("list", "past");
  if (params.get("show")) qs.set("show", String(show));
  const keep = qs.toString() ? `?${qs.toString()}` : "";

  if (!inTab.length) {
    if (tab === "coming") {
      return (
        <div className="ad-empty-wide">
          <EmptyCard
            a="Nothing"
            b="coming up."
            line="No events are on the calendar."
            sub="Members see an empty Events page until you add one."
            art="coupes"
            action={
              <Link className="ad-btn sm" href="/admin/events/new">
                Add an event
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="ad-q">
        <div className="ad-nomatch" role="status">
          <b>No past events yet.</b>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="ad-q">
        {visible.map((e) => {
          const { weekday, day } = dateParts(e.startTime);
          return (
            <Link
              key={e.id}
              className="ad-item"
              href={`/admin/events/${e.id}${keep}`}
              aria-current={e.id === openId ? "true" : undefined}
              data-default={!openId && e.id === first ? "true" : undefined}
              scroll={false}
            >
              <span className="lead">
                <DateCol weekday={weekday} day={day} />
              </span>
              <span>
                <span className="t">{e.title}</span>
                <span className="m">
                  {time24(e.startTime)}
                  {e.location ? ` · ${e.location}` : ""}
                </span>
              </span>
              <span className="end">
                <EndOf e={e} />
              </span>
            </Link>
          );
        })}
      </div>
      <MoreLine
        shown={visible.length}
        total={inTab.length}
        onMore={() => update({ show: String(show + PAGE_SIZE) })}
        summary={tab === "coming" ? `${inTab.length} coming up, soonest first` : `${inTab.length} past, latest first`}
      />
    </div>
  );
}
