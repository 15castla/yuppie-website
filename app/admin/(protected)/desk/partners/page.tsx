import Link from "next/link";

import { requireOwner } from "@/app/admin/require-owner";
import { dateWords, shortDate } from "@/components/admin/desk/format";
import { DeskShell, one, type SearchParams } from "@/components/admin/desk/shell";
import { isOutreachSent } from "@/lib/server/outreach/compute";
import { loadDesk } from "@/lib/server/outreach/desk";
import { CATEGORIES, CHANNELS, STAGES, isKey, stepWords } from "@/lib/server/outreach/model";
import { effectiveDue } from "@/lib/server/outreach/rules";

// Every partner (17 Nov 2026): find one fast before an impromptu meeting. Search by name, group, contact or domain;
// filter by stage and category. Owner only.

export default async function DeskPartnersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const sp = await searchParams;
  const data = await loadDesk();
  const q = (one(sp, "q") ?? "").trim().toLowerCase().slice(0, 100);
  const stage = one(sp, "stage");
  const category = one(sp, "category");
  const rows = data.targets
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
      return { t, last, next, people };
    });
  return (
    <DeskShell current="partners" sp={sp}>
      <section className="dk-panel" aria-labelledby="p-h">
        <div className="dk-panel-h">
          <h2 id="p-h">Partners</h2>
          <span className="count">{rows.length}</span>
        </div>
        <form className="dk-filters" action="/admin/desk/partners">
          <input type="search" name="q" placeholder="Name, person, domain" defaultValue={one(sp, "q") ?? ""} aria-label="Search partners" />
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
          <a className="dk-btn sm link" href="/admin/desk/partners">
            Clear
          </a>
        </form>
        {rows.length === 0 ? (
          <p className="dk-empty">{data.targets.length ? "No partner matches." : "No partners yet. Add one, or import the outreach log on Settings."}</p>
        ) : (
          <div className="dk-scroll">
            <table className="dk-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Stage</th>
                  <th className="dk-hide-sm">Category</th>
                  <th className="dk-hide-sm">Last sent</th>
                  <th>Next</th>
                  <th className="num dk-hide-sm">People</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ t, last, next, people }) => (
                  <tr key={t.id}>
                    <td className="name">
                      <Link href={`/admin/desk/t/${t.id}`}>{t.name}</Link>
                      {t.opted_out ? <span className="dk-chip opted" style={{ marginLeft: 8 }}>Opted out</span> : null}
                    </td>
                    <td>
                      <span className={`dk-chip stage ${t.stage}`}>{STAGES[t.stage]}</span>
                    </td>
                    <td className="dk-hide-sm">{CATEGORIES[t.category]}</td>
                    <td className="dk-hide-sm">{last ? `${CHANNELS[last.channel]} ${shortDate(last.sent_at!)}` : <span className="faint">-</span>}</td>
                    <td>{next ? `${stepWords(next.step)} ${dateWords(next.due)}` : t.next_call_at ? `Call ${shortDate(t.next_call_at)}` : <span className="faint">-</span>}</td>
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
