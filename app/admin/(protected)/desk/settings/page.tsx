import { requireDesk } from "@/app/admin/require-owner";
import { AlexSettings } from "@/components/admin/desk/alex";
import { ImportForm } from "@/components/admin/desk/import-form";
import { OutlookSettings } from "@/components/admin/desk/outlook";
import { DeskShell, one, type SearchParams } from "@/components/admin/desk/shell";
import { serviceDb } from "@/lib/server/db";
import { loadMe } from "@/lib/server/outreach/team";

// Desk settings (17 Nov 2026): the Outlook connection (Phase 2, 16 Nov), Alex (Phase 3: the Desk connector and the
// guidance for each kind of email) and the copy from the outreach log. Since 19 Nov 2026 the desk is a team's and its
// settings are personal where they are about the person (Albert: "Should the settings part of the desk be personal to
// each user so they can change email templates etc?"): your Outlook, your Alex, your email templates. The team, the
// counts and the import are shared.

async function count(table: string): Promise<number> {
  const { count: n } = await serviceDb().from(table).select("id", { count: "exact", head: true });
  return n ?? 0;
}

export default async function DeskSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireDesk();
  const sp = await searchParams;
  const [{ team, me }, targets, contacts, touches, outcomes, notes] = await Promise.all([
    loadMe(user.id),
    count("outreach_targets"),
    count("outreach_contacts"),
    count("outreach_touches"),
    count("outreach_outcomes"),
    count("outreach_notes"),
  ]);
  return (
    <DeskShell current="settings" sp={sp}>
      <h2 className="dk-label" style={{ marginTop: 18 }}>
        Yours, {me.firstName}
      </h2>
      <OutlookSettings owner={me.owner} firstName={me.firstName} />
      <AlexSettings me={me} />
      <h2 className="dk-label" style={{ marginTop: 18 }}>
        The desk
      </h2>
      <section className="dk-panel" aria-labelledby="tm-h" id="team">
        <div className="dk-panel-h">
          <h2 id="tm-h">The team</h2>
          <span className="count">{team.length}</span>
        </div>
        <ul className="dk-list">
          {team.map((m) => (
            <li key={m.id}>
              <div>
                <p className="t">
                  <span className="dk-rm">{m.initials}</span> {m.name}
                  {m.id === me.id ? <span className="dim"> · you</span> : null}
                </p>
                <p className="m">
                  {m.owner ? "Owner. Alex, the Outlook drafter and the 06:30 email are Albert's." : "On the desk, with the same powers as Albert."}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 8 }}>
          The code is the Relationship Manager on each partner. Someone joins the desk through Claude Code, never from here.
        </p>
      </section>
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
