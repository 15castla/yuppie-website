import Link from "next/link";

import { deskFollowup, deskSetAction } from "@/app/admin/desk-actions";
import type { BlotterFilters, BlotterRow, DueItem, Kpis } from "@/lib/server/outreach/compute";
import {
  ACTION_KINDS,
  CATEGORIES,
  CHANNEL_SHORT,
  CHANNELS,
  SOURCE_SHORT,
  SOURCES,
  STAGES,
  rateWords,
  stepWords,
  type Channel,
} from "@/lib/server/outreach/model";
import { addWorkingDays, ukDate } from "@/lib/server/outreach/rules";
import { dateWords, dayWords, shortDate, stampWords, timeWords } from "./format";
import { DeskSubmit } from "./submit";

// The desk home's pieces (17 Nov 2026): the KPI strip, the Due today list and the blotter. Server components;
// every button is a plain form posting to a desk action, so the page works before any JavaScript loads.

export function KpiStrip({ k }: { k: Kpis }) {
  const channels = Object.entries(k.sentByChannel)
    .map(([c, n]) => `${CHANNEL_SHORT[c as Channel] ?? c}${n}`)
    .join(" ");
  const delta = k.sentThisWeek - k.sentLastWeek;
  return (
    <section className="dk-kpis" aria-label="The numbers">
      <div className="dk-kpi">
        <p className="dk-kpi-l">Sent this week</p>
        <p className="dk-kpi-v">{k.sentThisWeek}</p>
        <p className="dk-kpi-s">
          {channels || "Nothing yet"} · {delta === 0 ? "same as" : delta > 0 ? `▲${delta} on` : `▼${-delta} on`} last week
        </p>
      </div>
      <div className="dk-kpi">
        <p className="dk-kpi-l">Response rate</p>
        <p className="dk-kpi-v">{k.delivered ? `${Math.round((k.replied / k.delivered) * 100)}%` : "-"}</p>
        <p className="dk-kpi-s">
          {k.replied} of {k.delivered} replied
        </p>
      </div>
      <div className="dk-kpi">
        <p className="dk-kpi-l">Positive rate</p>
        <p className="dk-kpi-v">{k.delivered ? `${Math.round((k.positive / k.delivered) * 100)}%` : "-"}</p>
        <p className="dk-kpi-s">
          {k.positive} of {k.delivered} positive
        </p>
      </div>
      <div className="dk-kpi">
        <p className="dk-kpi-l">Calls booked</p>
        <p className="dk-kpi-v">{k.callsBooked}</p>
        <p className="dk-kpi-s">
          {k.nextCall ? (
            <Link href={`/admin/desk/t/${k.nextCall.targetId}`}>
              Next: {k.nextCall.name}, {dayWords(k.nextCall.at)} {timeWords(k.nextCall.at)}
            </Link>
          ) : (
            "None coming up"
          )}
        </p>
      </div>
      <div className="dk-kpi">
        <p className="dk-kpi-l">Partners live</p>
        <p className="dk-kpi-v">{k.live}</p>
        <p className="dk-kpi-s">{k.agreed} agreed, not live yet</p>
      </div>
      <div className={`dk-kpi${k.due ? " hot" : ""}`}>
        <Link href="/admin/desk/today">
          <p className="dk-kpi-l">Follow-ups due</p>
          <p className="dk-kpi-v">{k.due}</p>
          <p className="dk-kpi-s">{k.late ? `${k.late} late` : "None late"}</p>
        </Link>
      </div>
    </section>
  );
}

function FollowupButtons({ id, back, today }: { id: string; back: string; today: string }) {
  return (
    <>
      <form action={deskFollowup}>
        <input type="hidden" name="followup" value={id} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="op" value="snooze" />
        <label className="dk-sr" htmlFor={`snooze-${id}`}>
          Snooze until
        </label>
        <input id={`snooze-${id}`} type="date" name="until" defaultValue={addWorkingDays(today, 1)} min={addWorkingDays(today, 1)} />
        <DeskSubmit className="dk-btn sm" busy="Snoozing…">
          Snooze
        </DeskSubmit>
      </form>
      <form action={deskFollowup}>
        <input type="hidden" name="followup" value={id} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="op" value="skip" />
        <DeskSubmit className="dk-btn sm" busy="Skipping…">
          Skip
        </DeskSubmit>
      </form>
    </>
  );
}

export function DueList({ items, back, empty = "Nothing due. Nothing late." }: { items: DueItem[]; back: string; empty?: string }) {
  const today = ukDate();
  if (items.length === 0) return <p className="dk-empty">{empty}</p>;
  return (
    <ul className="dk-due">
      {items.map((item) => {
        if (item.kind === "followup") {
          const tag = item.late ? <span className="dk-tag late">Late</span> : item.due === today ? <span className="dk-tag today">Today</span> : <span className="dk-tag soon">{dateWords(item.due).slice(0, 3)}</span>;
          return (
            <li key={`f-${item.id}`}>
              <span className="tag">{tag}</span>
              <span className="when">{dateWords(item.due)}</span>
              <span className="who">
                <Link href={`/admin/desk/t/${item.targetId}`}>{item.name}</Link>
              </span>
              <span className="what">
                {stepWords(item.step)} email{item.drafted ? " · draft ready" : ""}
                {item.stale ? " · stale draft" : ""}
              </span>
              <span className="to">{item.needsEmail ? "Needs an email address" : [...item.to, ...item.cc.map((c) => `cc ${c}`)].join(", ")}</span>
              <span className="acts">
                <Link className="dk-btn sm" href={`/admin/desk/t/${item.targetId}#log-email`}>
                  Log it
                </Link>
                <FollowupButtons id={item.id} back={back} today={today} />
              </span>
            </li>
          );
        }
        if (item.kind === "action") {
          return (
            <li key={`a-${item.id}`}>
              <span className="tag">
                <span className={`dk-tag ${item.late ? "late" : item.actionKind === "call" || item.actionKind === "meeting" ? "call" : "today"}`}>
                  {item.late ? "Late" : ACTION_KINDS[item.actionKind as keyof typeof ACTION_KINDS]}
                </span>
              </span>
              <span className="when">{item.startsAt ? `${dayWords(item.startsAt)} ${timeWords(item.startsAt)}` : dateWords(item.due)}</span>
              <span className="who">
                <Link href={`/admin/desk/t/${item.targetId}`}>{item.name}</Link>
              </span>
              <span className="what">{item.title}</span>
              <span className="to" />
              <span className="acts">
                <form action={deskSetAction}>
                  <input type="hidden" name="action" value={item.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="op" value="done" />
                  <DeskSubmit className="dk-btn sm" busy="Saving…">
                    Done
                  </DeskSubmit>
                </form>
              </span>
            </li>
          );
        }
        return (
          <li key={`c-${item.targetId}-${item.at}`}>
            <span className="tag">
              <span className="dk-tag call">Call</span>
            </span>
            <span className="when">
              {dayWords(item.at)} {timeWords(item.at)}
            </span>
            <span className="who">
              <Link href={`/admin/desk/t/${item.targetId}`}>{item.name}</Link>
            </span>
            <span className="what">Call booked</span>
            <span className="to" />
            <span className="acts" />
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_WORDS: Record<BlotterRow["status"], string> = {
  replied: "Replied",
  bounced: "Bounced",
  oof: "OOF",
  planned: "Planned",
  queued: "Queued",
  drafted: "Drafted",
  sent: "Sent",
  posted: "Posted",
  failed: "Failed",
  cancelled: "Cancelled",
  unconfirmed: "To confirm",
};

export function StatusChip({ status, sentiment }: { status: BlotterRow["status"]; sentiment?: BlotterRow["sentiment"] }) {
  const mark = status === "replied" ? (sentiment === "positive" ? " +" : sentiment === "negative" ? " -" : "") : "";
  return <span className={`dk-chip ${status}${status === "replied" ? ` ${sentiment ?? "none"}` : ""}`}>{STATUS_WORDS[status] + mark}</span>;
}

function stepShort(row: BlotterRow): string {
  if (row.kind === "first") return "1st";
  if (row.kind === "follow_up") return row.step === 2 ? "Jan" : "FU";
  if (row.kind === "resend") return "Re";
  if (row.kind === "forward") return "Fw";
  return "Conv";
}

function hrefWith(filters: BlotterFilters, change: Partial<Record<string, string | undefined>>): string {
  const params = new URLSearchParams();
  const base: Record<string, string | undefined> = {
    channel: filters.channel,
    stage: filters.stage,
    category: filters.category,
    source: filters.source,
    since: filters.since,
    q: filters.q,
    conv: filters.conversation ? "1" : undefined,
    sort: filters.sort,
    dir: filters.dir,
  };
  for (const [k, v] of Object.entries({ ...base, ...change })) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `/admin/desk?${s}#blotter` : "/admin/desk#blotter";
}

function SortHead({ label, field, filters, className }: { label: string; field: "sent" | "target" | "status"; filters: BlotterFilters; className?: string }) {
  const active = (filters.sort ?? "sent") === field;
  const dir = active && (filters.dir ?? "desc") === "desc" ? "asc" : "desc";
  return (
    <th className={className} aria-sort={active ? ((filters.dir ?? "desc") === "desc" ? "descending" : "ascending") : undefined}>
      <a href={hrefWith(filters, { sort: field, dir })}>
        {label}
        {active ? ((filters.dir ?? "desc") === "desc" ? " ▼" : " ▲") : ""}
      </a>
    </th>
  );
}

export function Blotter({ rows, filters }: { rows: BlotterRow[]; filters: BlotterFilters }) {
  return (
    <section className="dk-panel" id="blotter" aria-labelledby="blotter-h">
      <div className="dk-panel-h">
        <h2 id="blotter-h">Blotter</h2>
        <span className="count">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
      </div>
      <form className="dk-filters" action="/admin/desk#blotter" aria-label="Filter the blotter">
        <select name="channel" defaultValue={filters.channel ?? ""} aria-label="Channel">
          <option value="">All channels</option>
          {Object.entries(CHANNELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={filters.stage ?? ""} aria-label="Stage">
          <option value="">All stages</option>
          {Object.entries(STAGES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filters.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source ?? ""} aria-label="Address source">
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="dk-check">
          <span className="dim">Since</span>
          <input type="date" name="since" defaultValue={filters.since ?? ""} aria-label="Sent since" />
        </label>
        <input type="search" name="q" placeholder="Search" defaultValue={filters.q ?? ""} aria-label="Search the blotter" />
        <label className="dk-check">
          <input type="checkbox" name="conv" value="1" defaultChecked={filters.conversation} /> <span className="dim">Show conversation</span>
        </label>
        {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.dir && <input type="hidden" name="dir" value={filters.dir} />}
        <button className="dk-btn sm" type="submit">
          Filter
        </button>
        <a className="dk-btn sm link" href="/admin/desk#blotter">
          Clear
        </a>
      </form>
      {rows.length === 0 ? (
        <p className="dk-empty">Nothing matches. Log a first email or letter on a partner&apos;s page, or clear the filters.</p>
      ) : (
        <div className="dk-scroll">
          <table className="dk-table">
            <thead>
              <tr>
                <SortHead label="Sent" field="sent" filters={filters} />
                <SortHead label="Partner" field="target" filters={filters} />
                <th className="dk-hide-sm">Ch</th>
                <th className="dk-hide-sm">Step</th>
                <th className="dk-hide-sm">To (source)</th>
                <SortHead label="Status" field="status" filters={filters} />
                <th className="dk-hide-sm">Reply</th>
                <th className="num dk-hide-sm" title="Working days since it went, or to the reply">
                  Days
                </th>
                <th className="dk-hide-sm">Stage</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.sentAt ? stampWords(r.sentAt) : "-"}</td>
                  <td className="name">
                    <Link href={`/admin/desk/t/${r.targetId}`}>{r.name}</Link>
                  </td>
                  <td className="dk-hide-sm" title={CHANNELS[r.channel]}>
                    {CHANNEL_SHORT[r.channel]}
                  </td>
                  <td className="dk-hide-sm">{stepShort(r)}</td>
                  <td className="to dk-hide-sm">
                    {r.to || "-"}
                    {r.more ? ` +${r.more}` : ""}
                    {r.source ? <span className="dim"> ({SOURCE_SHORT[r.source]})</span> : null}
                  </td>
                  <td>
                    <StatusChip status={r.status} sentiment={r.sentiment} />
                  </td>
                  <td className="dk-hide-sm">{r.reply || <span className="faint">-</span>}</td>
                  <td className="num dk-hide-sm">{r.days ?? "-"}</td>
                  <td className="dk-hide-sm">
                    <span className={`dk-chip stage ${r.stage}`}>{STAGES[r.stage]}</span>
                  </td>
                  <td className={r.next?.late ? "late" : undefined}>
                    {r.next ? `${r.next.late ? "LATE " : ""}${r.next.step === 2 ? "Jan" : "FU"} ${shortDate(`${r.next.due}T12:00:00Z`)}` : r.paused ? <span className="dim">Paused</span> : <span className="faint">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export { rateWords };
