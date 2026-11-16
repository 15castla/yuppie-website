import Link from "next/link";

import { deskRateOutcome } from "@/app/admin/desk-actions";
import { requireOwner } from "@/app/admin/require-owner";
import { dateWords, dayWords, longDay, timeWords } from "@/components/admin/desk/format";
import { DueList } from "@/components/admin/desk/panels";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";
import { DeskSubmit } from "@/components/admin/desk/submit";
import { dueItems } from "@/lib/server/outreach/compute";
import { loadDesk } from "@/lib/server/outreach/desk";
import { addWorkingDays, ukDate } from "@/lib/server/outreach/rules";

// Today (17 Nov 2026): Albert's agenda for the day, the page the 06:30 email will link to (Phase 3). Everything due
// or late, calls and meetings, the next five working days, and replies still to rate. Owner only.

export default async function DeskTodayPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const sp = await searchParams;
  const data = await loadDesk();
  const now = new Date();
  const today = ukDate(now);
  const until = addWorkingDays(today, 5);
  const due = dueItems(data, now);
  const coming = dueItems(data, now, until).filter((i) => (i.kind === "call" ? ukDate(i.at) > today : i.due > today));
  const names = new Map(data.targets.map((t) => [t.id, t.name]));
  const toRate = data.outcomes.filter((o) => o.kind === "reply" && o.confirmed && !o.sentiment).sort((a, b) => b.received_at.localeCompare(a.received_at));
  return (
    <DeskShell current="today" sp={sp}>
      <section className="dk-panel" aria-labelledby="t-h">
        <div className="dk-panel-h">
          <h2 id="t-h">{longDay(now)}</h2>
          <span className="count">{due.length ? `${due.length} to do` : "Nothing due"}</span>
        </div>
        <DueList items={due} back="/admin/desk/today" />
      </section>
      <section className="dk-panel" aria-labelledby="c-h">
        <div className="dk-panel-h">
          <h2 id="c-h">The next five working days</h2>
          <span className="count">to {dateWords(until)}</span>
        </div>
        <DueList items={coming} back="/admin/desk/today" empty="Nothing coming up." />
      </section>
      <section className="dk-panel" aria-labelledby="r-h">
        <div className="dk-panel-h">
          <h2 id="r-h">Replies to rate</h2>
          <span className="count">{toRate.length}</span>
        </div>
        {toRate.length === 0 ? (
          <p className="dk-empty">Every reply is rated.</p>
        ) : (
          <ul className="dk-list">
            {toRate.map((o) => (
              <li key={o.id}>
                <div>
                  <p className="t">
                    <Link href={`/admin/desk/t/${o.target_id}`}>{names.get(o.target_id)}</Link>
                  </p>
                  <p className="m">
                    {o.from_name ?? o.from_address ?? "Reply"} · {dayWords(o.received_at)} {timeWords(o.received_at)}
                    {o.summary ? ` · ${o.summary}` : ""}
                  </p>
                </div>
                <form action={deskRateOutcome} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <input type="hidden" name="outcome" value={o.id} />
                  <input type="hidden" name="back" value="/admin/desk/today" />
                  {(["positive", "neutral", "negative"] as const).map((s) => (
                    <DeskSubmit key={s} className="dk-btn sm" name="sentiment" value={s} busy="Saving…">
                      {s === "positive" ? "Positive" : s === "neutral" ? "Neutral" : "Negative"}
                    </DeskSubmit>
                  ))}
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DeskShell>
  );
}
