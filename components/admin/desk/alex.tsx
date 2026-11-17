import { deskDisconnectConnector, deskSaveGuidance } from "@/app/admin/desk-alex-actions";
import { siteUrl } from "@/lib/emails/config";
import { serviceDb } from "@/lib/server/db";
import { GUIDANCE_KINDS, SUGGESTED_GUIDANCE, type GuidanceKind } from "@/lib/server/outreach/guidance";
import { dayWords } from "./format";
import { agoWords } from "./outlook";
import { DeskSubmit } from "./submit";

// Desk > Settings > Alex (Phase 3, 17 Nov 2026): how to connect Claude to the desk, the connections (with
// Disconnect), and Albert's guidance for each kind of email Alex writes. Until a kind is approved, Alex writes none of
// it. The guidance boxes start with Claude's suggested wording, which is only saved when Albert saves or approves it.

type GuidanceRow = {
  kind: GuidanceKind;
  instructions: string;
  example: string | null;
  approved_at: string | null;
  updated_at: string;
};
type GrantRow = {
  id: string;
  client_name: string | null;
  created_at: string;
  last_used_at: string | null;
  refresh_expires_at: string;
};

/** The open connections (not disconnected, refresh not expired) and the guidance; null before the Phase 3 migration. */
async function loadAlex(): Promise<{ grants: GrantRow[]; guidance: GuidanceRow[] } | null> {
  const db = serviceDb();
  const [g, r] = await Promise.all([
    db
      .from("desk_connector_grants")
      .select("id, client_name, created_at, last_used_at, refresh_expires_at")
      .is("revoked_at", null)
      .gt("refresh_expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    db.from("outreach_guidance").select("kind, instructions, example, approved_at, updated_at"),
  ]);
  if (g.error || r.error) return null;
  return { grants: (g.data ?? []) as GrantRow[], guidance: (r.data ?? []) as GuidanceRow[] };
}

export async function AlexSettings() {
  const loaded = await loadAlex().catch(() => null);
  // before the Phase 3 migration is applied, Settings still works without the panel
  if (!loaded) return null;
  const { grants, guidance } = loaded;
  const byKind = new Map(guidance.map((g) => [g.kind, g]));
  const approved = guidance.filter((g) => g.approved_at).length;
  const address = `${siteUrl()}/api/desk/mcp`;
  return (
    <section className="dk-panel" aria-labelledby="a-h" id="alex">
      <div className="dk-panel-h">
        <h2 id="a-h">Alex</h2>
        <span className="count">
          {grants.length ? "Connected" : "Not connected"} · {approved} of 3 kinds of email approved
        </span>
      </div>
      <div style={{ paddingTop: 10 }} className="dk-outlook">
        <p>
          Alex is your assistant in your own Claude account. Connected to the desk, Alex can brief you on a partner, turn a photo of meeting notes into a note
          and action points, and write follow-ups and replies in your voice, which the drafter puts into Outlook as drafts. Alex never sends.
        </p>
        {grants.length ? (
          <>
            <ul className="dk-list dk-grants">
              {grants.map((g) => (
                <li key={g.id}>
                  <div>
                    <p className="t">{g.client_name || "Claude"}</p>
                    <p className="m">
                      Connected {dayWords(g.created_at)}. {g.last_used_at ? `Last used ${agoWords(g.last_used_at)}.` : "Not used yet."}
                    </p>
                  </div>
                  <form action={deskDisconnectConnector} className="dk-inline">
                    <input type="hidden" name="grant" value={g.id} />
                    <DeskSubmit className="dk-btn sm danger" busy="Disconnecting…">
                      Disconnect
                    </DeskSubmit>
                  </form>
                </li>
              ))}
            </ul>
            <p className="hint">
              The connector&apos;s address, to connect again: <code>{address}</code>
            </p>
          </>
        ) : (
          <p>
            To connect: in Claude, open Settings, then Connectors, then Add custom connector. Name it <b>Club Yuppie Desk</b> and give it this address:{" "}
            <code>{address}</code>. Claude brings you back here to log in and say yes.
          </p>
        )}
        <h3 className="dk-label" style={{ marginTop: 6 }}>
          How Alex writes
        </h3>
        <p className="hint">
          Alex writes a kind of email only once you approve its guidance. Saving a change stops Alex writing that kind until you approve it again. Words you
          write yourself are never changed.
        </p>
        {(Object.keys(GUIDANCE_KINDS) as GuidanceKind[]).map((kind) => {
          const row = byKind.get(kind);
          const suggested = SUGGESTED_GUIDANCE[kind];
          const status = row?.approved_at ? `Approved ${dayWords(row.approved_at)}` : row ? "Draft, not approved" : "Suggested wording, not approved";
          return (
            <details key={kind} id={`g-${kind}`} className="dk-drawer" open={!row?.approved_at}>
              <summary>
                <span className="t">{GUIDANCE_KINDS[kind]}</span>
                <span className={row?.approved_at ? "dk-chip done" : "dk-tag today"}>{row?.approved_at ? "Approved" : "Not approved"}</span>
              </summary>
              <div>
                <form action={deskSaveGuidance} className="dk-form">
                  <input type="hidden" name="kind" value={kind} />
                  <label className="dk-field wide">
                    <span>How to write it</span>
                    <textarea name="instructions" rows={9} required maxLength={8000} defaultValue={row?.instructions ?? suggested.instructions} />
                  </label>
                  <label className="dk-field wide">
                    <span>An example in your voice</span>
                    <textarea name="example" rows={9} maxLength={8000} defaultValue={row?.example ?? suggested.example} />
                  </label>
                  <div className="dk-form-foot">
                    <DeskSubmit className="dk-btn primary" name="intent" value="approve" busy="Approving…">
                      {row?.approved_at ? "Save and approve" : "Approve"}
                    </DeskSubmit>
                    <DeskSubmit className="dk-btn" name="intent" value="save" busy="Saving…">
                      Save as draft
                    </DeskSubmit>
                    {row?.approved_at && (
                      <DeskSubmit className="dk-btn danger" name="intent" value="stop" busy="Stopping…" formNoValidate>
                        Stop Alex writing these
                      </DeskSubmit>
                    )}
                    <small className="hint">{status}.</small>
                  </div>
                </form>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
