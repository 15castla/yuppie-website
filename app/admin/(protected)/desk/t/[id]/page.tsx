import Link from "next/link";
import { notFound } from "next/navigation";

import { deskDeleteContact, deskDeleteTarget, deskFollowup, deskSetAction, deskSetFlags } from "@/app/admin/desk-actions";
import { requireDesk } from "@/app/admin/require-owner";
import { dateWords, dayWords, stampWords, timeWords } from "@/components/admin/desk/format";
import { FollowupText, ReplyTexts } from "@/components/admin/desk/followup-text";
import {
  ActionForm,
  BookMeetingForm,
  ContactForm,
  Drawer,
  EditTargetForm,
  LetterForm,
  LogEmailForm,
  NoteForm,
  OtherTouchForm,
  OutcomeForm,
  StageForm,
} from "@/components/admin/desk/forms";
import { DeskShell, type SearchParams } from "@/components/admin/desk/shell";
import { DeskSubmit } from "@/components/admin/desk/submit";
import { NotesPanel, TimelinePanel } from "@/components/admin/desk/timeline";
import { answeredReply } from "@/lib/server/outreach/agenda";
import { followupAddresses } from "@/lib/server/outreach/compute";
import { loadTarget } from "@/lib/server/outreach/desk";
import { ACTION_KINDS, ASKS, CATEGORIES, EXCLUSIVITY, MAILBOX_TYPES, SOURCES, STAGES, stepWords, type Followup } from "@/lib/server/outreach/model";
import { addWorkingDays, effectiveDue, ukDate } from "@/lib/server/outreach/rules";
import { loadMe, rmFor } from "@/lib/server/outreach/team";
import { buildTimeline, meetingWords } from "@/lib/server/outreach/timeline";

// A partner's page (17 Nov 2026; plan 5.3): everything about them on one screen, for a follow-up or an impromptu
// meeting. The stage, the Relationship Manager and the facts at the top, the next follow-up with its controls, the
// drawers to log anything, then the timeline beside the contacts, action points, notes and follow-ups. Since 19 Nov 2026
// the timeline shows only contact, with each meeting or call as one item (components/admin/desk/timeline.tsx); notes
// have their own panel and stage changes a history under the stage. The desk team only.

const FOLLOWUP_WORDS: Record<Followup["status"], string> = {
  scheduled: "Scheduled",
  drafted: "Drafted",
  done: "Sent",
  skipped: "Skipped",
  paused: "Paused",
  cancelled: "Stopped",
};
const REASON_WORDS: Record<string, string> = { replied: "they replied", bounced: "every address bounced", opted_out: "opted out", no_email: "no email address", manual: "by you", superseded: "replaced" };

export default async function DeskTargetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const user = await requireDesk();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [page, { team }] = await Promise.all([loadTarget(id), loadMe(user.id)]);
  if (!page) notFound();
  const { target: t, contacts, touches, outcomes, followups, actions, stageHistory, texts } = page;
  const back = `/admin/desk/t/${t.id}`;
  const today = ukDate();
  const contactName = new Map(contacts.map((c) => [c.id, c.name ?? c.email ?? "someone"]));
  const rm = rmFor(team, t.rm);
  const owner = team.find((m) => m.owner) ?? null;
  // the drafter reads the owner's mailbox: another RM's follow-ups aren't drafted (19 Nov 2026)
  const otherRm = rm && owner && rm.id !== owner.id ? rm : null;

  const open = followups
    .filter((f) => f.status === "scheduled" || f.status === "drafted" || f.status === "paused")
    .sort((a, b) => effectiveDue(a.due_on, a.snoozed_until).localeCompare(effectiveDue(b.due_on, b.snoozed_until)));
  const next = open[0];
  const nextTo = next ? followupAddresses(page, next) : null;
  const nextText = next ? (texts ?? []).find((x) => x.followup_id === next.id && x.status !== "discarded") : undefined;
  const nextInThread = !!next && touches.some((x) => x.sequence_id === next.sequence_id && x.channel === "email" && x.status === "sent");

  const timeline = buildTimeline(page);
  const nextMeeting = timeline.meetings.filter((m) => m.state === "booked").sort((a, b) => a.at.localeCompare(b.at))[0];

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
              {stageHistory.length > 0 && (
                <details className="dk-hist">
                  <summary>History</summary>
                  <ul>
                    {stageHistory.map((h) => (
                      <li key={h.id}>
                        {stampWords(h.at)} · {h.from_stage ? `${STAGES[h.from_stage as keyof typeof STAGES] ?? h.from_stage} to ` : ""}
                        {STAGES[h.to_stage as keyof typeof STAGES] ?? h.to_stage}
                        {h.note ? ` · ${h.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </dd>
          </div>
          <div>
            <dt>RM</dt>
            <dd>{rm ? <span title={rm.name}><span className="dk-rm">{rm.initials}</span> {rm.name}</span> : <span className="dim">Nobody yet</span>}</dd>
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
            <dt>Next meeting</dt>
            <dd>{nextMeeting ? `${meetingWords(nextMeeting).replace(" booked", "")}, ${dayWords(nextMeeting.at)} ${timeWords(nextMeeting.at)}` : "-"}</dd>
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
                  <DeskSubmit className="dk-btn sm" busy="Snoozing…">
                    Snooze
                  </DeskSubmit>
                </form>
                {[
                  ["skip", "Skip"],
                  ["pause", "Pause"],
                ].map(([op, label]) => (
                  <form key={op} action={deskFollowup}>
                    <input type="hidden" name="followup" value={next.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="op" value={op} />
                    <DeskSubmit className="dk-btn sm" busy="Saving…">
                      {label}
                    </DeskSubmit>
                  </form>
                ))}
              </>
            )}
            {next.status === "paused" && (
              <form action={deskFollowup}>
                <input type="hidden" name="followup" value={next.id} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="op" value="resume" />
                <DeskSubmit className="dk-btn sm" busy="Resuming…">
                  Resume
                </DeskSubmit>
              </form>
            )}
            <form action={deskFollowup}>
              <input type="hidden" name="followup" value={next.id} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="op" value="stop" />
              <DeskSubmit className="dk-btn sm" busy="Stopping…">
                Stop follow-ups
              </DeskSubmit>
            </form>
          </div>
        )}
        {next && (next.status === "scheduled" || next.status === "drafted" || next.status === "paused") && (
          <FollowupText f={next} text={nextText} back={back} inThread={nextInThread} noDrafterFor={otherRm?.firstName} />
        )}
        <ReplyTexts
          // once Albert has emailed in that thread since their reply (he sent Alex's draft, or wrote his own), it's done
          texts={(texts ?? []).filter((x) => {
            const o = x.outcome_id ? outcomes.find((y) => y.id === x.outcome_id) : undefined;
            return !o || !answeredReply(touches, o);
          })}
          back={back}
          fromOf={(id) => {
            const o = outcomes.find((x) => x.id === id);
            return (o?.contact_id ? contactName.get(o.contact_id) : null) ?? o?.from_name ?? o?.from_address ?? "their reply";
          }}
        />

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
          <Drawer id="book" title="Book a meeting or call, or log one" hint="One item on the timeline: Meeting booked, then Meeting, with its emails, notes and action points.">
            <BookMeetingForm target={t} back={back} />
          </Drawer>
          <Drawer id="log-other" title="Log a phone call, WhatsApp or LinkedIn message">
            <OtherTouchForm target={t} back={back} contacts={contacts} touches={touches} />
          </Drawer>
          <Drawer id="add-note" title="Add a note">
            <NoteForm target={t.id} back={back} meetings={timeline.meetings} />
          </Drawer>
          <Drawer id="add-action" title="Add an action point">
            <ActionForm target={t.id} back={back} />
          </Drawer>
          <Drawer id="stage" title="Stage">
            <StageForm t={t} back={back} />
          </Drawer>
        </div>

        <div className="dk-grid2">
          <TimelinePanel timeline={timeline} target={t.id} back={back} contactName={contactName} touches={touches} />

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
                            <DeskSubmit className="dk-btn sm danger" busy="Deleting…">
                              Delete person
                            </DeskSubmit>
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
                        <DeskSubmit className="dk-btn sm" name="op" value="done" busy="Saving…">
                          Done
                        </DeskSubmit>
                        <DeskSubmit className="dk-btn sm link" name="op" value="cancel" busy="Saving…">
                          Drop
                        </DeskSubmit>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <NotesPanel notes={timeline.notes} target={t.id} back={back} />

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
                  <EditTargetForm t={t} back={back} team={team} />
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
                  <DeskSubmit className="dk-btn sm" busy="Saving…">
                    {t.do_not_follow_up ? "Allow follow-ups" : "Do not follow up"}
                  </DeskSubmit>
                </form>
                <form action={deskSetFlags}>
                  <input type="hidden" name="target" value={t.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="op" value={t.opted_out ? "opt_in" : "opt_out"} />
                  <DeskSubmit className="dk-btn sm" busy="Saving…">
                    {t.opted_out ? "Undo opt-out" : "They opted out (the whole business)"}
                  </DeskSubmit>
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
                  <DeskSubmit className="dk-btn sm danger" busy="Deleting…">
                    Delete partner
                  </DeskSubmit>
                </form>
              </details>
            </section>
          </div>
        </div>
      </div>
    </DeskShell>
  );
}
