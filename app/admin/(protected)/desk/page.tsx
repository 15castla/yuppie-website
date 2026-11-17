import { requireOwner } from "@/app/admin/require-owner";
import { Blotter, DueList, KpiStrip } from "@/components/admin/desk/panels";
import { DeskShell, one, type SearchParams } from "@/components/admin/desk/shell";
import { blotterRows, dueItems, kpis, type BlotterFilters } from "@/lib/server/outreach/compute";
import { loadDesk } from "@/lib/server/outreach/desk";
import { CATEGORIES, CHANNELS, SOURCES, STAGES, isKey } from "@/lib/server/outreach/model";
import { isoDate } from "@/lib/server/outreach/rules";

// The Outreach Desk's home (17 Nov 2026; plan 5.2): the KPI strip, what's due today (and late), and the blotter: one
// row per partner with their most recent email or letter (or every email, with "Every email" ticked), filterable and
// sortable. Owner only.

function filtersOf(sp: SearchParams): BlotterFilters {
  const channel = one(sp, "channel");
  const stage = one(sp, "stage");
  const category = one(sp, "category");
  const source = one(sp, "source");
  const sort = one(sp, "sort");
  return {
    channel: isKey(CHANNELS, channel) ? channel : undefined,
    stage: isKey(STAGES, stage) ? stage : undefined,
    category: isKey(CATEGORIES, category) ? category : undefined,
    source: isKey(SOURCES, source) ? source : undefined,
    since: isoDate(one(sp, "since")) ?? undefined,
    q: one(sp, "q")?.slice(0, 100) || undefined,
    every: one(sp, "all") === "1",
    sort: sort === "target" || sort === "status" || sort === "sent" ? sort : undefined,
    dir: one(sp, "dir") === "asc" ? "asc" : one(sp, "dir") === "desc" ? "desc" : undefined,
  };
}

export default async function DeskHome({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const sp = await searchParams;
  const data = await loadDesk();
  const now = new Date();
  const filters = filtersOf(sp);
  const due = dueItems(data, now);
  return (
    <DeskShell current="desk" sp={sp}>
      <div style={{ marginTop: 14 }}>
        <KpiStrip k={kpis(data, now)} />
      </div>
      <section className="dk-panel" aria-labelledby="due-h">
        <div className="dk-panel-h">
          <h2 id="due-h">Due today</h2>
          <span className="count">{due.length ? `${due.length} to do` : ""}</span>
        </div>
        <DueList items={due} back="/admin/desk" />
      </section>
      <Blotter rows={blotterRows(data, filters, now)} filters={filters} />
    </DeskShell>
  );
}
