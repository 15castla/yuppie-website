import { requireOwner } from "@/app/admin/require-owner";
import { AlexSettings } from "@/components/admin/desk/alex";
import { ImportForm } from "@/components/admin/desk/import-form";
import { OutlookSettings } from "@/components/admin/desk/outlook";
import { DeskShell, one, type SearchParams } from "@/components/admin/desk/shell";
import { serviceDb } from "@/lib/server/db";

// Desk settings (17 Nov 2026): the Outlook connection (Phase 2, 16 Nov), Alex (Phase 3: the Desk connector and the
// guidance for each kind of email) and the copy from the outreach log. Owner only.

async function count(table: string): Promise<number> {
  const { count: n } = await serviceDb().from(table).select("id", { count: "exact", head: true });
  return n ?? 0;
}

export default async function DeskSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const sp = await searchParams;
  const [targets, contacts, touches, outcomes, notes] = await Promise.all([
    count("outreach_targets"),
    count("outreach_contacts"),
    count("outreach_touches"),
    count("outreach_outcomes"),
    count("outreach_notes"),
  ]);
  return (
    <DeskShell current="settings" sp={sp}>
      <OutlookSettings />
      <AlexSettings />
      <section className="dk-panel" aria-labelledby="s-h">
        <div className="dk-panel-h">
          <h2 id="s-h">In the desk</h2>
        </div>
        <p style={{ paddingTop: 10 }} className="num">
          {targets} partners · {contacts} contacts · {touches} emails, letters and calls · {outcomes} replies, bounces and automatic replies · {notes} notes
        </p>
      </section>
      <section className="dk-panel" aria-labelledby="i-h">
        <div className="dk-panel-h">
          <h2 id="i-h">Import the outreach log</h2>
        </div>
        <div style={{ paddingTop: 12 }}>
          {/* a fresh form after each import, so the last file's preview and button don't linger */}
          <ImportForm key={one(sp, "done") ?? one(sp, "error") ?? "pick"} />
        </div>
      </section>
    </DeskShell>
  );
}
