import Link from "next/link";

import { deskConfirmOutcome, deskConfirmTouch, deskIgnoreOutcome, deskIgnoreTouch, deskLinkDrafter, deskUnlinkDrafter } from "@/app/admin/desk-actions";
import { serviceDb } from "@/lib/server/db";
import { drafterHealth } from "@/lib/server/outreach/drafter";
import { TOUCH_KINDS, type Outcome, type Target, type Touch } from "@/lib/server/outreach/model";
import { dayWords, stampWords, timeWords } from "./format";
import { DeskSubmit } from "./submit";

// The Outlook connection on the desk (Phase 2, 16 Nov 2026): the line under the title saying when the drafter last
// synced, its settings (link with the fingerprint, unlink, the last syncs), and the review list of what it found but
// couldn't be sure about.

export function agoWords(iso: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${dayWords(iso)} ${timeWords(iso)}`;
}

function ageMs(iso: string): number {
  return new Date().getTime() - new Date(iso).getTime();
}

async function reviewCount(): Promise<number> {
  const db = serviceDb();
  const [a, b] = await Promise.all([
    db.from("outreach_touches").select("id", { count: "exact", head: true }).eq("status", "unconfirmed"),
    db.from("outreach_outcomes").select("id", { count: "exact", head: true }).eq("confirmed", false),
  ]);
  return (a.count ?? 0) + (b.count ?? 0);
}

/** "Outlook synced 4 min ago · 2 to check", under the desk's title. */
export async function OutlookLine() {
  let health: Awaited<ReturnType<typeof drafterHealth>>;
  let toCheck = 0;
  try {
    [health, toCheck] = await Promise.all([drafterHealth(serviceDb()), reviewCount()]);
  } catch {
    // before the Phase 2 migration is applied, the desk still works without the line
    return null;
  }
  const last = health.runs[0];
  let words: string;
  let warn = false;
  if (!health.key) words = "Outlook not linked";
  else if (!last) words = "Outlook linked, not synced yet";
  else if (!last.ok && last.finished_at) {
    words = `Outlook sync failed ${agoWords(last.finished_at)}`;
    warn = true;
  } else if (health.lastOk) {
    const age = ageMs(health.lastOk.finished_at);
    words = `Outlook synced ${agoWords(health.lastOk.finished_at)}`;
    // the Mac checks every 15 minutes while it's awake; after two hours, say so
    warn = age > 2 * 3600_000;
  } else words = "Outlook syncing";
  return (
    <>
      <span className={warn ? "warn" : undefined}>
        <Link href="/admin/desk/settings#outlook">{words}</Link>
      </span>
      {toCheck > 0 && (
        <span className="warn">
          <Link href="/admin/desk/today#review">{toCheck} to check</Link>
        </span>
      )}
    </>
  );
}

const COUNT_WORDS: Record<string, [string, string]> = {
  read: ["message read", "messages read"],
  sent: ["email sent", "emails sent"],
  replies: ["reply", "replies"],
  bounces: ["bounce", "bounces"],
  auto_replies: ["automatic reply", "automatic replies"],
  drafts: ["draft made", "drafts made"],
  failed: ["draft failed", "drafts failed"],
};

function countWords(k: string, v: number): string {
  const w = COUNT_WORDS[k];
  return `${v} ${w ? w[v === 1 ? 0 : 1] : k.replace(/_/g, " ")}`;
}

/** Desk > Settings: link the drafter (by fingerprint only), unlink it, and the last few syncs. */
export async function OutlookSettings({ owner = true, firstName = "Albert" }: { owner?: boolean; firstName?: string } = {}) {
  // the drafter reads Albert's mailbox: linking it stays his; the rest of the team's Outlook comes with the scanner for
  // their own mailbox (19 Nov 2026)
  if (!owner) {
    return (
      <section className="dk-panel" aria-labelledby="o-h" id="outlook">
        <div className="dk-panel-h">
          <h2 id="o-h">Your Outlook</h2>
          <span className="count">Not linked yet</span>
        </div>
        <div style={{ paddingTop: 10 }} className="dk-outlook">
          <p>
            The desk reads Albert&apos;s mailbox for now. Your Outlook comes with the scanner for your own mailbox, {firstName}: until then, log the emails you
            send to your partners and their replies on each partner&apos;s page, and no follow-up drafts are made for them.
          </p>
        </div>
      </section>
    );
  }
  const health = await drafterHealth(serviceDb());
  return (
    <section className="dk-panel" aria-labelledby="o-h" id="outlook">
      <div className="dk-panel-h">
        <h2 id="o-h">Outlook</h2>
        <span className="count">{health.key ? "Linked" : "Not linked"}</span>
      </div>
      <div style={{ paddingTop: 10 }} className="dk-outlook">
        {health.key ? (
          <>
            <p>
              Linked to <b>{health.key.label}</b> on {dayWords(health.key.created_at)} (fingerprint {health.key.fingerprint}…).{" "}
              {health.key.last_used_at ? `Last heard from ${agoWords(health.key.last_used_at)}.` : "Not heard from yet."}
            </p>
            <form action={deskUnlinkDrafter} className="dk-inline">
              <DeskSubmit className="dk-btn sm danger" busy="Unlinking…">
                Unlink
              </DeskSubmit>
              <small className="hint">Stops the drafter reaching the desk at once. Link it again with a new fingerprint.</small>
            </form>
          </>
        ) : (
          <p>
            The drafter on your Mac reads your mailbox and tells the desk about emails to partners, their replies and bounces, and makes the follow-up drafts.
            It never sends. To link it, run <code>draft-partner-emails desk-link</code> in Terminal and paste the fingerprint it shows here.
          </p>
        )}
        <form action={deskLinkDrafter} className="dk-form">
          <label className="dk-field wide">
            <span>{health.key ? "Link again: fingerprint" : "Fingerprint"}</span>
            <input type="text" name="fingerprint" required autoComplete="off" spellCheck={false} pattern="[0-9a-fA-F:\s]{64,100}" placeholder="64 letters and numbers from desk-link" />
          </label>
          <div className="dk-form-foot">
            <DeskSubmit className="dk-btn primary" busy="Linking…">
              {health.key ? "Link this one instead" : "Link Outlook"}
            </DeskSubmit>
            <small className="hint">Only the fingerprint goes here, never the key: the key stays in your Mac&apos;s Keychain.</small>
          </div>
        </form>
        {health.runs.length > 0 && (
          <div className="dk-scroll">
            <table className="dk-table">
              <thead>
                <tr>
                  <th>Sync</th>
                  <th>Result</th>
                  <th>Found</th>
                </tr>
              </thead>
              <tbody>
                {health.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{stampWords(r.started_at)}</td>
                    <td>{!r.finished_at ? "Running or stopped" : r.ok ? "OK" : <span className="warn">{r.message ?? "Failed"}</span>}</td>
                    <td className="wrap">
                      {Object.entries(r.counts ?? {})
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => countWords(k, v))
                        .join(" · ") || "nothing new"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function TargetPick({ targets, value, candidates }: { targets: Pick<Target, "id" | "name">[]; value: string; candidates: string[] }) {
  const first = candidates.length ? targets.filter((t) => candidates.includes(t.id)) : [];
  const rest = targets.filter((t) => !candidates.includes(t.id));
  return (
    <select name="target" defaultValue={value} aria-label="Partner">
      {first.length > 0 && (
        <optgroup label="Probably">
          {first.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={first.length ? "Another partner" : "Partner"}>
        {rest.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

const GUESS_WORDS: Partial<Record<keyof typeof TOUCH_KINDS, string>> = {
  first: "First email",
  follow_up: "Follow-up",
  resend: "Resend (new address)",
  forward: "Forward",
  conversation: "Reply in the conversation",
};

/**
 * Today > To check: what the drafter found but couldn't be sure about. A reply matched only by the sender's domain
 * (or to two partners on one domain), and an email Albert typed himself to someone at a partner. Confirm it (and
 * say whose, and what it was), or ignore it: ignored messages never come back.
 */
export function ReviewList({ touches, outcomes, targets, back }: { touches: Touch[]; outcomes: Outcome[]; targets: Pick<Target, "id" | "name">[]; back: string }) {
  const names = new Map(targets.map((t) => [t.id, t.name]));
  const sends = touches.filter((t) => t.status === "unconfirmed").sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  const replies = outcomes.filter((o) => !o.confirmed).sort((a, b) => b.received_at.localeCompare(a.received_at));
  if (!sends.length && !replies.length) return <p className="dk-empty">Nothing to check.</p>;
  const preview = (s: string | null) => (s ? s.replace(/\s+/g, " ").trim().slice(0, 220) : "");
  return (
    <ul className="dk-list dk-review">
      {replies.map((o) => (
        <li key={o.id}>
          <div>
            <p className="t">
              {o.kind === "reply" ? "A reply" : o.kind === "bounce" ? "A bounce" : o.kind === "auto_reply" ? "An automatic reply" : "A message"} from {o.from_name ?? o.from_address ?? "someone"}
              {o.from_name && o.from_address ? <span className="dim"> ({o.from_address})</span> : null}
            </p>
            <p className="m">
              {stampWords(o.received_at)} · probably {names.get(o.target_id)} (by the address&apos;s domain)
              {o.subject ? ` · "${o.subject}"` : ""}
              {o.hint === "possible_opt_out" ? " · possible opt-out" : o.hint === "invite" ? " · a calendar invitation" : ""}
            </p>
            {o.body_text && <p className="m">{preview(o.body_text)}</p>}
            {o.web_link && (
              <p className="m">
                <a href={o.web_link} target="_blank" rel="noreferrer">
                  Open in Outlook
                </a>
              </p>
            )}
          </div>
          <div className="dk-review-acts">
            <form action={deskConfirmOutcome} className="dk-inline">
              <input type="hidden" name="outcome" value={o.id} />
              <input type="hidden" name="back" value={back} />
              <TargetPick targets={targets} value={o.target_id} candidates={o.candidate_targets ?? [o.target_id]} />
              <DeskSubmit className="dk-btn sm primary" busy="Saving…">
                Confirm
              </DeskSubmit>
            </form>
            <form action={deskIgnoreOutcome} className="dk-inline">
              <input type="hidden" name="outcome" value={o.id} />
              <input type="hidden" name="back" value={back} />
              <DeskSubmit className="dk-btn sm link" busy="Saving…">
                Not a partner&apos;s
              </DeskSubmit>
            </form>
          </div>
        </li>
      ))}
      {sends.map((t) => (
        <li key={t.id}>
          <div>
            <p className="t">
              An email you sent to {t.recipients.map((r) => r.address).filter(Boolean).join(", ") || "someone"}
            </p>
            <p className="m">
              {t.sent_at ? stampWords(t.sent_at) : ""} · probably {names.get(t.target_id)}
              {t.subject ? ` · "${t.subject}"` : ""}
            </p>
            {t.body_text && <p className="m">{preview(t.body_text)}</p>}
            {t.web_link && (
              <p className="m">
                <a href={t.web_link} target="_blank" rel="noreferrer">
                  Open in Outlook
                </a>
              </p>
            )}
          </div>
          <div className="dk-review-acts">
            <form action={deskConfirmTouch} className="dk-inline">
              <input type="hidden" name="touch" value={t.id} />
              <input type="hidden" name="back" value={back} />
              <TargetPick targets={targets} value={t.target_id} candidates={t.candidate_targets?.length ? t.candidate_targets : [t.target_id]} />
              <select name="kind" defaultValue={t.guess_kind ?? "first"} aria-label="What it was">
                {Object.entries(GUESS_WORDS).map(([k, w]) => (
                  <option key={k} value={k}>
                    {w}
                  </option>
                ))}
              </select>
              <DeskSubmit className="dk-btn sm primary" busy="Saving…">
                Confirm
              </DeskSubmit>
            </form>
            <form action={deskIgnoreTouch} className="dk-inline">
              <input type="hidden" name="touch" value={t.id} />
              <input type="hidden" name="back" value={back} />
              <DeskSubmit className="dk-btn sm link" busy="Saving…">
                Not outreach
              </DeskSubmit>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
