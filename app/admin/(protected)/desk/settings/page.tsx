import { requireOwner } from "@/app/admin/require-owner";
import { ImportForm } from "@/components/admin/desk/import-form";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";
import { serviceDb } from "@/lib/server/db";

// Desk settings (17 Nov 2026): the copy from the outreach log, and what's coming (the Outlook connection in Phase
// 2, Alex in Phase 3). Owner only.

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
          <ImportForm />
        </div>
      </section>
      <section className="dk-panel" aria-labelledby="n-h">
        <div className="dk-panel-h">
          <h2 id="n-h">Coming next</h2>
        </div>
        <ul className="dk-list">
          <li>
            <div>
              <p className="t">The Outlook connection</p>
              <p className="m">The drafter on your Mac logs every email, reply, bounce and out-of-office here by itself, and makes the follow-ups as drafts the night before. Nothing is ever sent.</p>
            </div>
          </li>
          <li>
            <div>
              <p className="t">Alex</p>
              <p className="m">Your assistant: meeting notes from a photo, briefings on any partner, replies written in your voice, and your day by email at 06:30.</p>
            </div>
          </li>
        </ul>
      </section>
    </DeskShell>
  );
}
