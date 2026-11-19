import { requireDesk } from "@/app/admin/require-owner";
import { Blotter, DueList, KpiStrip, RmTabs } from "@/components/admin/desk/panels";
import { DeskShell, one, type SearchParams } from "@/components/admin/desk/shell";
import { blotterRows, dueItems, kpis, type BlotterFilters } from "@/lib/server/outreach/compute";
import { loadDesk } from "@/lib/server/outreach/desk";
import { CATEGORIES, CHANNELS, SOURCES, STAGES, isKey } from "@/lib/server/outreach/model";
import { forRm, rmChoice } from "@/lib/server/outreach/rm";
import { isoDate } from "@/lib/server/outreach/rules";
import { loadMe, rmFor } from "@/lib/server/outreach/team";

// The Outreach Desk's home (17 Nov 2026; plan 5.2): the KPI strip, what's due today (and late), and the blotter: one
// row per partner with their most recent email or letter (or every email, with "Every email" ticked), filterable and
// sortable. Since 19 Nov 2026: each partner's Relationship Manager, and ?rm= shows one RM's partners (the numbers and
// Due today too); every RM's by default. The desk team only.

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
  const user = await requireDesk();
  const [sp, all, { team, me }] = await Promise.all([searchParams, loadDesk(), loadMe(user.id)]);
  const rm = rmChoice(one(sp, "rm"), team, me, "all");
  const data = forRm(all, rm.id, team.find((m) => m.owner)?.id);
  const now = new Date();
  const filters = { ...filtersOf(sp), rm: rm.id ? rm.key : undefined };
  const due = dueItems(data, now);
  const rmOfTarget = new Map(all.targets.map((t) => [t.id, t.rm ?? null]));
  return (
    <DeskShell current="desk" sp={sp}>
      <RmTabs team={team} value={rm.key} path="/admin/desk" />
      <div style={{ marginTop: 14 }}>
        <KpiStrip k={kpis(data, now)} />
      </div>
      <section className="dk-panel" aria-labelledby="due-h">
        <div className="dk-panel-h">
          <h2 id="due-h">Due today</h2>
          <span className="count">{due.length ? `${due.length} to do` : ""}</span>
        </div>
        <DueList items={due} back={rm.id ? `/admin/desk?rm=${rm.key}` : "/admin/desk"} rmOf={rm.id ? undefined : (id) => rmFor(team, rmOfTarget.get(id))} />
      </section>
      <Blotter rows={blotterRows(data, filters, now)} filters={filters} team={team} />
    </DeskShell>
  );
}
