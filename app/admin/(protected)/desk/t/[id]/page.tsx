import Link from "next/link";
import { notFound } from "next/navigation";

import { deskDeleteContact, deskDeleteNote, deskDeleteOutcome, deskDeleteTarget, deskDeleteTouch, deskFollowup, deskSetAction, deskSetFlags } from "@/app/admin/desk-actions";
import { requireOwner } from "@/app/admin/require-owner";
import { dateWords, dayWords, stampWords, timeWords } from "@/components/admin/desk/format";
import { ActionForm, ContactForm, Drawer, EditTargetForm, LetterForm, LogEmailForm, NoteForm, OtherTouchForm, OutcomeForm, StageForm } from "@/components/admin/desk/forms";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";
import { followupAddresses, replyTimeWords } from "@/lib/server/outreach/compute";
import { loadTarget } from "@/lib/server/outreach/desk";
import {
  ACTION_KINDS,
  ASKS,
  CATEGORIES,
  CHANNELS,
  EXCLUSIVITY,
  MAILBOX_TYPES,
  NOTE_KINDS,
  OUTCOME_KINDS,
  SENTIMENTS,
  SIGNERS,
  SOURCES,
  STAGES,
  stepWords,
  type Followup,
} from "@/lib/server/outreach/model";
import { addWorkingDays, effectiveDue, ukDate } from "@/lib/server/outreach/rules";

// A partner's page (17 Nov 2026; plan 5.3): everything about them on one screen, for a follow-up or an impromptu
// meeting. The stage and the facts at the top, the next follow-up with its controls, the drawers to log anything,
// then the timeline (every email, letter, call, reply, note and stage change, newest first) beside the contacts,
// action points, notes and follow-ups. Owner only.

type Item = { at: string; key: string; chip: { cls: string; word: string }; title: string; meta?: string; body?: string | null; del?: { action: (fd: FormData) => Promise<void>; field: string; id: string; confirm: boolean } };

const FOLLOWUP_WORDS: Record<Followup["status"], string> = {
  scheduled: "Scheduled",
  drafted: "Drafted",
  done: "Sent",
  skipped: "Skipped",
  paused: "Paused",
  cancelled: "Stopped",
};
const REASON_WORDS: Record<string, string> = { replied: "they replied", bounced: "every address bounced", opted_out: "opted out", no_email: "no email address", manual: "by you", superseded: "replaced" };

function Del({ d, back, target }: { d: NonNullable<Item["del"]>; back: string; target: string }) {
  return (
    <details>
      <summary className="dim" style={{ cursor: "pointer", fontSize: 12 }}>
        Delete
      </summary>
      <form action={d.action} style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name={d.field} value={d.id} />
        {d.confirm && (
          <label className="dk-check">
            <input type="checkbox" name="confirm" value="delete" required /> Delete for good
          </label>
        )}
        <button className="dk-btn sm danger" type="submit">
          Delete
        </button>
      </form>
    </details>
  );
}

export default async function DeskTargetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireOwner();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const page = await loadTarget(id);
  if (!page) notFound();
  const { target: t, contacts, touches, outcomes, followups, actions, notes, stageHistory } = page;
  const back = `/admin/desk/t/${t.id}`;
  const today = ukDate();
  const contactName = new Map(contacts.map((c) => [c.id, c.name ?? c.email ?? "someone"]));

  const open = followups
    .filter((f) => f.status === "scheduled" || f.status === "drafted" || f.status === "paused")
    .sort((a, b) => effectiveDue(a.due_on, a.snoozed_until).localeCompare(effectiveDue(b.due_on, b.snoozed_until)));
  const next = open[0];
  const nextTo = next ? followupAddresses(page, next) : null;

  // the timeline
  const items: Item[] = [];
  for (const x of touches) {
    const who = x.recipients.map((r) => (r.contact_id ? contactName.get(r.contact_id) : null) ?? r.address ?? "").filter(Boolean);
    const bounced = x.recipients.filter((r) => r.delivery === "bounced").length;
    const verb = x.channel === "letter" ? "Letter posted" : x.channel === "email" ? "Email sent" : CHANNELS[x.channel];
    items.push({
      at: x.sent_at ?? x.created_at,
      key: `t-${x.id}`,
      chip: { cls: x.status === "sent" || x.status === "posted" ? "sent" : x.status, word: x.kind === "conversation" ? CHANNELS[x.channel] : x.channel === "letter" ? "Letter" : x.channel === "email" ? "Email" : CHANNELS[x.channel] },
      title: `${verb}${x.kind !== "first" && x.kind !== "conversation" ? `, ${x.kind === "follow_up" ? stepWords(x.step).toLowerCase() : x.kind}` : x.kind === "first" ? ", first" : ""}${who.length ? ` to ${who.join(", ")}` : ""}`,
      meta: [x.subject && `"${x.subject}"`, x.version, x.attachment, bounced ? `${bounced} bounced` : null, x.counts_in_stats ? null : "not counted", x.note].filter(Boolean).join(" · "),
      body: x.body_text,
      del: { action: deskDeleteTouch, field: "touch", id: x.id, confirm: true },
    });
  }
  for (const o of outcomes) {
    const from = (o.contact_id ? contactName.get(o.contact_id) : null) ?? o.from_name ?? o.from_address ?? "";
    const answered = o.touch_id ? touches.find((x) => x.id === o.touch_id) : undefined;
    items.push({
      at: o.received_at,
      key: `o-${o.id}`,
      chip: {
        cls: o.kind === "reply" ? `replied ${o.sentiment ?? "none"}` : o.kind === "bounce" ? "bounced" : o.kind === "opt_out_request" ? "opted" : "oof",
        word: o.kind === "reply" ? `Reply${o.sentiment === "positive" ? " +" : o.sentiment === "negative" ? " -" : ""}` : OUTCOME_KINDS[o.kind],
      },
      title: `${OUTCOME_KINDS[o.kind]}${from ? ` from ${from}` : ""}${o.kind === "bounce" && o.bounced_address ? `: ${o.bounced_address}` : ""}`,
      meta: [
        o.subject && `"${o.subject}"`,
        o.bounce_code,
        o.sentiment ? SENTIMENTS[o.sentiment] : null,
        o.kind === "reply" && answered?.sent_at ? `${replyTimeWords(answered.sent_at, o.received_at)} after the ${answered.channel === "letter" ? "letter" : "email"}` : null,
        o.summary,
      ]
        .filter(Boolean)
        .join(" · "),
      body: o.body_text,
      del: { action: deskDeleteOutcome, field: "outcome", id: o.id, confirm: true },
    });
  }
  for (const n of notes) {
    items.push({
      at: n.happened_at,
      key: `n-${n.id}`,
      chip: { cls: "stage", word: NOTE_KINDS[n.kind] },
      title: n.title ?? `${NOTE_KINDS[n.kind]} notes`,
      meta: n.source === "assistant" ? "From Alex" : n.source === "import" ? "From the outreach log" : undefined,
      body: n.body,
      del: { action: deskDeleteNote, field: "note", id: n.id, confirm: false },
    });
  }
  for (const h of stageHistory) {
    items.push({ at: h.at, key: `s-${h.id}`, chip: { cls: `stage ${h.to_stage}`, word: "Stage" }, title: `${h.from_stage ? `${STAGES[h.from_stage as keyof typeof STAGES] ?? h.from_stage} to ` : ""}${STAGES[h.to_stage as keyof typeof STAGES] ?? h.to_stage}`, meta: h.note ?? undefined });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));

  const openActions = actions.filter((a) => a.status === "open").sort((a, b) => (a.starts_at ?? a.due_on ?? "9").localeCompare(b.starts_at ?? b.due_on ?? "9"));
  const hasEmail = contacts.some((c) => c.email && !c.opted_out);

  return (
    <DeskShell current={null} sp={sp}>
      <div style={{ marginTop: 16 }}>
        <p className="dk-crumb">
          <Link href="/admin/desk/partners">Partners</Link> /
        </p>
        <h2 className="dk-h1">{t.name}</h2>
        <p className="dk-sub">
          {[CATEGORIES[t.category], t.group_name, t.domains.join(", ") || null, t.website].filter(Boolean).join(" · ")}
        </p>
        <dl className="dk-facts">
          <div>
            <dt>Stage</dt>
            <dd>
              <span className={`dk-chip stage ${t.stage}`}>{STAGES[t.stage]}</span>
            </dd>
          </div>
          <div>
            <dt>Ask</dt>
            <dd>{ASKS[t.ask]}</dd>
          </div>
          <div>
            <dt>Exclusivity</dt>
            <dd>
              {EXCLUSIVITY[t.exclusivity]}
              {t.exclusivity_category ? ` (${t.exclusivity_category})` : ""}
            </dd>
          </div>
          <div>
            <dt>Signed by</dt>
            <dd>{SIGNERS[t.signed_by]}</dd>
          </div>
          <div>
            <dt>Next call</dt>
            <dd>{t.next_call_at ? `${dayWords(t.next_call_at)} ${timeWords(t.next_call_at)}` : "-"}</dd>
          </div>
          {t.opted_out && (
            <div>
              <dd>
                <span className="dk-chip opted">Opted out</span>
              </dd>
            </div>
          )}
          {t.do_not_follow_up && (
            <div>
              <dd>
                <span className="dk-chip paused">No follow-ups</span>
              </dd>
            </div>
          )}
        </dl>

        {next && (
          <div className="dk-next" aria-label="Next follow-up">
            <span className={`dk-tag ${effectiveDue(next.due_on, next.snoozed_until) < today ? "late" : effectiveDue(next.due_on, next.snoozed_until) === today ? "today" : "soon"}`}>
              {next.status === "paused" ? "Paused" : effectiveDue(next.due_on, next.snoozed_until) < today ? "Late" : "Next"}
            </span>
            <strong>
              {stepWords(next.step)} email {next.status === "paused" ? "waiting" : "due"} {dateWords(effectiveDue(next.due_on, next.snoozed_until))}
            </strong>
            <span className="dim">
              {nextTo?.to.length ? `to ${[...nextTo.to, ...nextTo.cc.map((c) => `cc ${c}`)].join(", ")}` : "needs an email address"}
              {next.status === "paused" && next.reason ? ` (${REASON_WORDS[next.reason] ?? next.reason})` : ""}
            </span>
            {next.status !== "paused" && (
              <>
                <form action={deskFollowup}>
                  <input type="hidden" name="followup" value={next.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="op" value="snooze" />
                  <label className="dk-sr" htmlFor="snooze-next">
                    Snooze until
                  </label>
                  <input id="snooze-next" type="date" name="until" defaultValue={addWorkingDays(today, 1)} min={addWorkingDays(today, 1)} />
                  <button className="dk-btn sm" type="submit">
                    Snooze
                  </button>
                </form>
                {[
                  ["skip", "Skip"],
                  ["pause", "Pause"],
                ].map(([op, label]) => (
                  <form key={op} action={deskFollowup}>
                    <input type="hidden" name="followup" value={next.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="op" value={op} />
                    <button className="dk-btn sm" type="submit">
                      {label}
                    </button>
                  </form>
                ))}
              </>
            )}
            {next.status === "paused" && (
              <form action={deskFollowup}>
                <input type="hidden" name="followup" value={next.id} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="op" value="resume" />
                <button className="dk-btn sm" type="submit">
                  Resume
                </button>
              </form>
            )}
            <form action={deskFollowup}>
              <input type="hidden" name="followup" value={next.id} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="op" value="stop" />
              <button className="dk-btn sm" type="submit">
                Stop follow-ups
              </button>
            </form>
          </div>
        )}

        <div className="dk-drawers">
          <Drawer id="log-email" title="Log an email" hint="An email you sent: the first, the follow-up, a resend or a reply in the conversation.">
            <LogEmailForm target={t} back={back} contacts={contacts} touches={touches} />
          </Drawer>
          <Drawer id="log-letter" title="Letter posted">
            <LetterForm target={t} back={back} contacts={contacts} touches={touches} />
          </Drawer>
          <Drawer id="log-reply" title="Log a reply, bounce or out-of-office">
            <OutcomeForm target={t} back={back} contacts={contacts} touches={touches} />
          </Drawer>
          <Drawer id="log-other" title="Log a call, meeting, WhatsApp or LinkedIn message">
            <OtherTouchForm target={t} back={back} contacts={contacts} touches={touches} />
          </Drawer>
          <Drawer id="add-note" title="Add meeting notes or a note">
            <NoteForm target={t.id} back={back} />
          </Drawer>
          <Drawer id="add-action" title="Add an action point">
            <ActionForm target={t.id} back={back} />
          </Drawer>
          <Drawer id="stage" title="Stage and next call">
            <StageForm t={t} back={back} />
          </Drawer>
        </div>

        <div className="dk-grid2">
          <section className="dk-panel" aria-labelledby="tl-h">
            <div className="dk-panel-h">
              <h2 id="tl-h">Timeline</h2>
              <span className="count">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="dk-empty">Nothing yet. Log the first email or letter above.</p>
            ) : (
              <ul className="dk-tl">
                {items.map((i) => (
                  <li key={i.key}>
                    <span className="d">{stampWords(i.at)}</span>
                    <span className="c">
                      <span className={`dk-chip ${i.chip.cls}`}>{i.chip.word}</span>
                    </span>
                    <div className="b">
                      <p className="t">{i.title}</p>
                      {i.meta && <p className="m">{i.meta}</p>}
                      {i.body && (
                        <details>
                          <summary>Show the full text</summary>
                          <pre>{i.body}</pre>
                        </details>
                      )}
                    </div>
                    <span className="x">{i.del && <Del d={i.del} back={back} target={t.id} />}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div>
            <section className="dk-panel" aria-labelledby="ct-h">
              <div className="dk-panel-h">
                <h2 id="ct-h">Contacts</h2>
                <span className="count">{contacts.length}</span>
              </div>
              <ul className="dk-list">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <div>
                      <p className="t">
                        {c.name ?? c.email}
                        {c.is_primary ? <span className="dim"> · main</span> : null}
                        {c.opted_out ? (
                          <>
                            {" "}
                            <span className="dk-chip opted">Opted out</span>
                          </>
                        ) : null}
                        {c.email_status === "bounced" ? (
                          <>
                            {" "}
                            <span className="dk-chip bounced">Bounced</span>
                          </>
                        ) : null}
                      </p>
                      <p className="m">{[c.role, c.role === MAILBOX_TYPES[c.mailbox_type] ? null : MAILBOX_TYPES[c.mailbox_type], c.name ? c.email : null].filter(Boolean).join(" · ")}</p>
                      <p className="m">
                        {SOURCES[c.email_source]}
                        {c.source_note ? `: ${c.source_note}` : ""}
                      </p>
                      <details style={{ marginTop: 6 }}>
                        <summary className="dim" style={{ cursor: "pointer", fontSize: 12 }}>
                          Edit
                        </summary>
                        <div style={{ marginTop: 8 }}>
                          <ContactForm target={t.id} back={back} c={c} />
                          <form action={deskDeleteContact} style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="hidden" name="target" value={t.id} />
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="contact" value={c.id} />
                            <label className="dk-check">
                              <input type="checkbox" name="confirm" value="delete" required /> Delete this person for good (their emails stay without their name)
                            </label>
                            <button className="dk-btn sm danger" type="submit">
                              Delete person
                            </button>
                          </form>
                        </div>
                      </details>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="dk-drawers">
                <Drawer title="Add a contact">
                  <ContactForm target={t.id} back={back} />
                </Drawer>
              </div>
              {!hasEmail && <p className="dim" style={{ marginTop: 8 }}>No email address yet: follow-ups need one.</p>}
            </section>

            <section className="dk-panel" aria-labelledby="ac-h">
              <div className="dk-panel-h">
                <h2 id="ac-h">Action points</h2>
                <span className="count">{openActions.length} open</span>
              </div>
              {openActions.length === 0 ? (
                <p className="dk-empty">None open.</p>
              ) : (
                <ul className="dk-list">
                  {openActions.map((a) => (
                    <li key={a.id}>
                      <div>
                        <p className="t">{a.title}</p>
                        <p className="m">
                          {ACTION_KINDS[a.kind]}
                          {a.starts_at ? ` · ${dayWords(a.starts_at)} ${timeWords(a.starts_at)}` : a.due_on ? ` · due ${dateWords(a.due_on)}` : ""}
                        </p>
                      </div>
                      <form action={deskSetAction} style={{ display: "flex", gap: 6 }}>
                        <input type="hidden" name="action" value={a.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="dk-btn sm" type="submit" name="op" value="done">
                          Done
                        </button>
                        <button className="dk-btn sm link" type="submit" name="op" value="cancel">
                          Drop
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dk-panel" aria-labelledby="fu-h">
              <div className="dk-panel-h">
                <h2 id="fu-h">Follow-ups</h2>
              </div>
              {followups.length === 0 ? (
                <p className="dk-empty">None. The follow-up is scheduled when the first email or letter is logged.</p>
              ) : (
                <ul className="dk-list">
                  {followups
                    .slice()
                    .sort((a, b) => a.due_on.localeCompare(b.due_on))
                    .map((f) => (
                      <li key={f.id}>
                        <div>
                          <p className="t">
                            {stepWords(f.step)} · {dateWords(effectiveDue(f.due_on, f.snoozed_until))}
                          </p>
                          <p className="m">
                            {FOLLOWUP_WORDS[f.status]}
                            {f.reason ? ` (${REASON_WORDS[f.reason] ?? f.reason})` : ""}
                            {f.snoozed_until ? ` · snoozed from ${dateWords(f.due_on)}` : ""}
                            {f.stale_draft ? " · delete the draft in Outlook" : ""}
                          </p>
                        </div>
                        <span className={`dk-chip ${f.status === "done" ? "done" : f.status === "scheduled" ? "sent" : f.status}`}>{FOLLOWUP_WORDS[f.status]}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section className="dk-panel" aria-labelledby="nt-h">
              <div className="dk-panel-h">
                <h2 id="nt-h">About them</h2>
              </div>
              <div style={{ paddingTop: 10 }}>
                {t.ask_detail && (
                  <p className="dk-notes">
                    <b>The ask</b>
                    {t.ask_detail}
                  </p>
                )}
                {t.hook && (
                  <p className="dk-notes">
                    <b>Hook</b>
                    {t.hook}
                  </p>
                )}
                {t.avoid && (
                  <p className="dk-notes">
                    <b>Don&apos;t mention</b>
                    {t.avoid}
                  </p>
                )}
                {t.postal_address && (
                  <p className="dk-notes">
                    <b>Postal address</b>
                    {t.postal_address}
                  </p>
                )}
                {t.notes && (
                  <p className="dk-notes">
                    <b>Notes</b>
                    {t.notes}
                  </p>
                )}
                {!t.ask_detail && !t.hook && !t.avoid && !t.postal_address && !t.notes && <p className="dk-empty">Nothing yet.</p>}
              </div>
              <div className="dk-drawers">
                <Drawer title="Edit partner">
                  <EditTargetForm t={t} back={back} />
                </Drawer>
              </div>
            </section>

            <section className="dk-panel" aria-labelledby="dz-h">
              <div className="dk-panel-h">
                <h2 id="dz-h">Contact and privacy</h2>
              </div>
              <div className="dk-bar">
                <form action={deskSetFlags}>
                  <input type="hidden" name="target" value={t.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="op" value={t.do_not_follow_up ? "follow_up" : "no_follow_up"} />
                  <button className="dk-btn sm" type="submit">
                    {t.do_not_follow_up ? "Allow follow-ups" : "Do not follow up"}
                  </button>
                </form>
                <form action={deskSetFlags}>
                  <input type="hidden" name="target" value={t.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="op" value={t.opted_out ? "opt_in" : "opt_out"} />
                  <button className="dk-btn sm" type="submit">
                    {t.opted_out ? "Undo opt-out" : "They opted out (the whole business)"}
                  </button>
                </form>
              </div>
              <details style={{ marginTop: 12 }}>
                <summary className="dim" style={{ cursor: "pointer" }}>
                  Delete this partner
                </summary>
                <form action={deskDeleteTarget} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="target" value={t.id} />
                  <label className="dk-check">
                    <input type="checkbox" name="confirm" value="delete" required /> Delete {t.name} and everything about them (contacts, emails, letters, replies, notes). This can&apos;t be undone. Copies in Outlook and OneDrive stay.
                  </label>
                  <button className="dk-btn sm danger" type="submit">
                    Delete partner
                  </button>
                </form>
              </details>
            </section>
          </div>
        </div>
      </div>
    </DeskShell>
  );
}
