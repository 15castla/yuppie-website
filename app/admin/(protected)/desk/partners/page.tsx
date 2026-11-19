import Link from "next/link";

import { requireDesk } from "@/app/admin/require-owner";
import { dateWords, shortDate } from "@/components/admin/desk/format";
import { RmCode, RmTabs } from "@/components/admin/desk/panels";
import { DeskShell, one, type SearchParams } from "@/components/admin/desk/shell";
import { isOutreachSent } from "@/lib/server/outreach/compute";
import { loadDesk } from "@/lib/server/outreach/desk";
import { CATEGORIES, CHANNELS, CONFIRMED, STAGES, isKey, stepWords } from "@/lib/server/outreach/model";
import { forRm, rmChoice } from "@/lib/server/outreach/rm";
import { effectiveDue } from "@/lib/server/outreach/rules";
import { loadMe } from "@/lib/server/outreach/team";

// Every partner (17 Nov 2026): find one fast before an impromptu meeting. Since 19 Nov 2026 (Albert: "should only
// people that have confirmed be in the partners page, the rest that have just been contacted should be in the
// blotter?"; he chose a Prospects tab): Partners opens on the confirmed (Agreed and Live) and Prospects lists everyone
// else, those not contacted yet included; a search looks through both. Each with its Relationship Manager; ?rm= shows
// one RM's. Filter by stage and category. The desk team only.

export default async function DeskPartnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireDesk();
  const [sp, all, { team, me }] = await Promise.all([searchParams, loadDesk(), loadMe(user.id)]);
  const rm = rmChoice(one(sp, "rm"), team, me, "all");
  const data = forRm(all, rm.id, team.find((m) => m.owner)?.id);
  const q = (one(sp, "q") ?? "").trim().toLowerCase().slice(0, 100);
  const stage = one(sp, "stage");
  const category = one(sp, "category");
  const prospects = one(sp, "view") === "prospects";
  const nowIso = new Date().toISOString();
  const confirmed = (s: string) => CONFIRMED.includes(s as never);
  // a search, or a stage picked, looks through both tabs
  const both = !!q || isKey(STAGES, stage);
  const counts = { partners: data.targets.filter((t) => confirmed(t.stage)).length, prospects: data.targets.filter((t) => !confirmed(t.stage)).length };
  const rows = data.targets
    .filter((t) => (both ? true : prospects ? !confirmed(t.stage) : confirmed(t.stage)))
    .filter((t) => (isKey(STAGES, stage) ? t.stage === stage : true))
    .filter((t) => (isKey(CATEGORIES, category) ? t.category === category : true))
    .filter((t) => {
      if (!q) return true;
      const people = data.contacts.filter((c) => c.target_id === t.id).map((c) => `${c.name ?? ""} ${c.email ?? ""} ${c.role ?? ""}`);
      return [t.name, t.group_name ?? "", t.domains.join(" "), ...people].join(" ").toLowerCase().includes(q);
    })
    .map((t) => {
      const last = data.touches.filter((x) => x.target_id === t.id && isOutreachSent(x)).sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0];
      const next = data.followups
        .filter((f) => f.target_id === t.id && (f.status === "scheduled" || f.status === "drafted"))
        .map((f) => ({ due: effectiveDue(f.due_on, f.snoozed_until), step: f.step }))
        .sort((a, b) => a.due.localeCompare(b.due))[0];
      const people = data.contacts.filter((c) => c.target_id === t.id).length;
      const meeting = data.actions
        .filter((a) => a.target_id === t.id && (a.kind === "meeting" || a.kind === "call") && a.status === "open" && a.starts_at && a.starts_at >= nowIso)
        .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))[0];
      return { t, last, next, people, meeting };
    });
  const keep = { rm: rm.id ? rm.key : undefined };
  const tabHref = (view: "partners" | "prospects") => {
    const p = new URLSearchParams();
    if (view === "prospects") p.set("view", "prospects");
    if (keep.rm) p.set("rm", keep.rm);
    if (isKey(CATEGORIES, category)) p.set("category", category);
    const s = p.toString();
    return s ? `/admin/desk/partners?${s}` : "/admin/desk/partners";
  };
  const heading = both ? "Partners and prospects" : prospects ? "Prospects" : "Partners";
  return (
    <DeskShell current="partners" sp={sp}>
      <RmTabs team={team} value={rm.key} path="/admin/desk/partners" keep={{ view: prospects ? "prospects" : undefined }} />
      <nav className="dk-subtabs" aria-label="Partners or prospects">
        <Link href={tabHref("partners")} aria-current={!both && !prospects ? "page" : undefined}>
          Partners <span className="n">{counts.partners}</span>
        </Link>
        <Link href={tabHref("prospects")} aria-current={!both && prospects ? "page" : undefined}>
          Prospects <span className="n">{counts.prospects}</span>
        </Link>
      </nav>
      <section className="dk-panel" aria-labelledby="p-h">
        <div className="dk-panel-h">
          <h2 id="p-h">{heading}</h2>
          <span className="count">
            {rows.length}
            {!both && !prospects ? " agreed or live" : ""}
          </span>
        </div>
        <form className="dk-filters" action="/admin/desk/partners">
          {prospects && <input type="hidden" name="view" value="prospects" />}
          {keep.rm && <input type="hidden" name="rm" value={keep.rm} />}
          <input type="search" name="q" placeholder="Name, person, domain" defaultValue={one(sp, "q") ?? ""} aria-label="Search partners and prospects" />
          <select name="stage" defaultValue={isKey(STAGES, stage) ? stage : ""} aria-label="Stage">
            <option value="">All stages</option>
            {Object.entries(STAGES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={isKey(CATEGORIES, category) ? category : ""} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button className="dk-btn sm" type="submit">
            Find
          </button>
          <a className="dk-btn sm link" href={tabHref(prospects ? "prospects" : "partners")}>
            Clear
          </a>
        </form>
        {rows.length === 0 ? (
          <p className="dk-empty">
            {data.targets.length === 0
              ? "No partners yet. Add one, or import the outreach log on Settings."
              : both
                ? "Nothing matches."
                : prospects
                  ? "No prospects."
                  : "No confirmed partners yet. They show here once they're Agreed or Live; everyone else is in Prospects."}
          </p>
        ) : (
          <div className="dk-scroll">
            <table className="dk-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th title="Relationship Manager">RM</th>
                  <th>Stage</th>
                  <th className="dk-hide-sm">Category</th>
                  <th className="dk-hide-sm">Last sent</th>
                  <th>Next</th>
                  <th className="num dk-hide-sm">People</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, last, next, people, meeting }) => (
                  <tr key={t.id}>
                    <td className="name">
                      <Link href={`/admin/desk/t/${t.id}`}>{t.name}</Link>
                      {t.opted_out ? (
                        <span className="dk-chip opted" style={{ marginLeft: 8 }}>
                          Opted out
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <RmCode team={team} id={t.rm} />
                    </td>
                    <td>
                      <span className={`dk-chip stage ${t.stage}`}>{STAGES[t.stage]}</span>
                    </td>
                    <td className="dk-hide-sm">{CATEGORIES[t.category]}</td>
                    <td className="dk-hide-sm">{last ? `${CHANNELS[last.channel]} ${shortDate(last.sent_at!)}` : <span className="faint">-</span>}</td>
                    <td>
                      {meeting && (!next || meeting.starts_at!.slice(0, 10) <= next.due) ? (
                        `${meeting.kind === "call" ? "Call" : "Meeting"} ${shortDate(meeting.starts_at!)}`
                      ) : next ? (
                        `${stepWords(next.step)} ${dateWords(next.due)}`
                      ) : t.next_call_at ? (
                        `Call ${shortDate(t.next_call_at)}`
                      ) : (
                        <span className="faint">-</span>
                      )}
                    </td>
                    <td className="num dk-hide-sm">{people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DeskShell>
  );
}
