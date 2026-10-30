"use client";

// The Attendees tab (B-D7, r2b 17): Export list (.csv), then who booked (confirmed, by when they booked) and
// the cancelled people with what was refunded. Seven rows, then Show all.

import { useState } from "react";

import { Chips } from "@/components/admin/list-controls";
import { dayDate, pounds } from "@/components/admin/format";
import { Icon } from "@/components/admin/icons";
import { Avatar, Pill } from "@/components/admin/ui";

export type AttendeeView = {
  bookingId: string;
  name: string;
  email: string;
  confirmed: boolean;
  bookedAt: string;
  cancelledAt: string | null;
  amountPence: number;
  refund: "none" | "pending" | "succeeded" | "failed";
  refundPence: number | null;
};

const FIRST = 7;

function amountWords(a: AttendeeView): string {
  if (a.confirmed) return a.amountPence > 0 ? `${pounds(a.amountPence)} paid` : "Included";
  if (a.refund === "succeeded") return `${pounds(a.refundPence ?? a.amountPence)} refunded`;
  if (a.refund === "pending") return "Refund on its way";
  if (a.refund === "failed") return "Refund failed";
  return a.amountPence > 0 ? "Not refunded" : "Included";
}

export function Attendees({ eventId, attendees }: { eventId: string; attendees: AttendeeView[] }) {
  const [filter, setFilter] = useState<"confirmed" | "cancelled">("confirmed");
  const [all, setAll] = useState(false);
  const confirmed = attendees.filter((a) => a.confirmed);
  const cancelled = attendees.filter((a) => !a.confirmed);
  const rows = filter === "confirmed" ? confirmed : cancelled;
  const visible = all ? rows : rows.slice(0, FIRST);

  return (
    <>
      <div className="ad-acts" style={{ marginTop: 14 }}>
        <a className="ad-btn sm secondary" href={`/api/admin/events/${eventId}/attendees`} download>
          <Icon name="download" size={18} />
          Export list (.csv)
        </a>
      </div>
      <p className="ad-hint">Name, email, phone, what they paid and when they booked. Opens in Excel and Numbers.</p>
      <div className="ad-tools" style={{ marginTop: 20 }}>
        <Chips
          label="Show attendees"
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setAll(false);
          }}
          items={[
            { key: "confirmed", label: "Confirmed", count: confirmed.length },
            { key: "cancelled", label: "Cancelled", count: cancelled.length },
          ]}
        />
      </div>
      <div className="ad-q" style={{ marginTop: 0 }}>
        {visible.length === 0 ? (
          <div className="ad-nomatch" role="status">
            <b>{filter === "confirmed" ? "Nobody has booked yet." : "Nobody has cancelled."}</b>
          </div>
        ) : (
          visible.map((a) => (
            <div className={`ad-att${a.confirmed ? "" : " off"}`} key={a.bookingId}>
              <span className="av">
                <Avatar name={a.name} />
              </span>
              <span className="t">{a.name}</span>
              <span className="pl">
                {a.confirmed ? <Pill kind="ink">Confirmed</Pill> : <Pill kind="muted">Cancelled</Pill>}
                <span>{amountWords(a)}</span>
              </span>
              <span className="m">
                {a.email} · {a.confirmed || !a.cancelledAt ? `booked ${dayDate(a.bookedAt)}` : `cancelled ${dayDate(a.cancelledAt)}`}
              </span>
            </div>
          ))
        )}
      </div>
      {!all && rows.length > FIRST && (
        <div className="ad-more">
          <span>
            Showing {FIRST} of {rows.length}
          </span>
          <button type="button" className="ad-link" onClick={() => setAll(true)}>
            Show all
          </button>
        </div>
      )}
    </>
  );
}
