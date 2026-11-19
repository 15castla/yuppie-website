import { deskAddAction, deskAddNote, deskDeleteAction, deskDeleteNote, deskDeleteOutcome, deskDeleteTouch, deskSetAction } from "@/app/admin/desk-actions";
import { replyTimeWords } from "@/lib/server/outreach/compute";
import { CHANNELS, NOTE_KINDS, OUTCOME_KINDS, SENTIMENTS, stepWords, type Action, type Note, type Outcome, type Touch } from "@/lib/server/outreach/model";
import { meetingWords, type ContactItem, type Meeting, type Timeline, type TimelineEntry } from "@/lib/server/outreach/timeline";
import { dateWords, dayWords, stampWords, timeWords } from "./format";
import { DeskSubmit } from "./submit";

// A partner's timeline (19 Nov 2026): only contact (emails, letters, replies, LinkedIn and WhatsApp messages, calls and
// meetings), newest first. A meeting or call is one row, "Meeting booked" until it happens and "Meeting" after, holding
// the emails that arranged it, its notes and its action points. Bounces and automatic replies sit inside the email they
// answer. Notes that aren't about a meeting are in the Notes panel beside it. Built by lib/server/outreach/timeline.ts.

type Ctx = { target: string; back: string; name: (contactId: string | null) => string | null; touches: Touch[] };

/** "Overview.pdf (412 KB)" for each file Outlook says was attached (not the images in a signature). */
function filesWords(files: { name: string; size: number | null; inline?: boolean }[] | undefined): string | null {
  const list = (files ?? []).filter((a) => !a.inline);
  return list.length ? list.map((a) => (a.size ? `${a.name} (${Math.max(1, Math.round(a.size / 1024))} KB)` : a.name)).join(", ") : null;
}

function Del({
  action,
  field,
  id,
  back,
  target,
  confirm,
  label = "Delete",
}: {
  action: (fd: FormData) => Promise<void>;
  field: string;
  id: string;
  back: string;
  target: string;
  confirm: boolean;
  label?: string;
}) {
  return (
    <details>
      <summary className="dim" style={{ cursor: "pointer", fontSize: 12 }}>
        {label}
      </summary>
      <form action={action} style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name={field} value={id} />
        {confirm && (
          <label className="dk-check">
            <input type="checkbox" name="confirm" value="delete" required /> Delete for good
          </label>
        )}
        <DeskSubmit className="dk-btn sm danger" busy="Deleting…">
          Delete
        </DeskSubmit>
      </form>
    </details>
  );
}

function FullText({ body, label = "Show the full text" }: { body: string | null; label?: string }) {
  if (!body) return null;
  return (
    <details>
      <summary>{label}</summary>
      <pre>{body}</pre>
    </details>
  );
}

function OutlookLink({ link }: { link: string | null | undefined }) {
  if (!link) return null;
  return (
    <p className="m">
      <a href={link} target="_blank" rel="noreferrer">
        Open in Outlook
      </a>
    </p>
  );
}

function touchChip(x: Touch): { cls: string; word: string } {
  const bounced = x.recipients.filter((r) => r.delivery === "bounced").length;
  if (x.status === "unconfirmed") return { cls: "unconfirmed", word: "To confirm" };
  if (x.channel === "email" && x.recipients.length > 0 && bounced === x.recipients.length) return { cls: "bounced", word: "Bounced" };
  const word = x.kind === "conversation" ? CHANNELS[x.channel] : x.channel === "letter" ? "Letter" : x.channel === "email" ? "Email" : CHANNELS[x.channel];
  return { cls: x.status === "sent" || x.status === "posted" ? "sent" : x.status, word };
}

function touchTitle(x: Touch, c: Ctx): string {
  const who = x.recipients.map((r) => c.name(r.contact_id) ?? r.address ?? "").filter(Boolean);
  const verb = x.channel === "letter" ? "Letter posted" : x.channel === "email" ? "Email sent" : CHANNELS[x.channel];
  const step =
    x.kind !== "first" && x.kind !== "conversation"
      ? `, ${x.kind === "follow_up" ? stepWords(x.step).toLowerCase() : x.kind}`
      : x.kind === "first"
        ? ", first"
        : "";
  return `${verb}${step}${who.length ? ` to ${who.join(", ")}` : ""}`;
}

function touchMeta(x: Touch): string {
  const bounced = x.recipients.filter((r) => r.delivery === "bounced").length;
  return [
    x.status === "unconfirmed" ? "Found in Outlook: confirm it on Today" : null,
    x.subject && `"${x.subject}"`,
    x.version,
    filesWords(x.attachments) ?? x.attachment,
    bounced ? `${bounced} bounced` : null,
    x.counts_in_stats ? null : "not counted",
    x.note,
  ]
    .filter(Boolean)
    .join(" · ");
}

function outcomeChip(o: Outcome): { cls: string; word: string } {
  if (!o.confirmed) return { cls: "unconfirmed", word: "To confirm" };
  return {
    cls: o.kind === "reply" ? `replied ${o.sentiment ?? "none"}` : o.kind === "bounce" ? "bounced" : o.kind === "opt_out_request" ? "opted" : "oof",
    word:
      o.kind === "reply"
        ? `Reply${o.sentiment === "positive" ? " +" : o.sentiment === "negative" ? " -" : ""}`
        : o.kind === "auto_reply"
          ? "Auto reply"
          : OUTCOME_KINDS[o.kind],
  };
}

function outcomeTitle(o: Outcome, c: Ctx): string {
  const from = c.name(o.contact_id) ?? o.from_name ?? o.from_address ?? "";
  return `${OUTCOME_KINDS[o.kind]}${from ? ` from ${from}` : ""}${o.kind === "bounce" && o.bounced_address ? `: ${o.bounced_address}` : ""}`;
}

function outcomeMeta(o: Outcome, c: Ctx): string {
  const answered = o.touch_id ? c.touches.find((x) => x.id === o.touch_id) : undefined;
  return [
    o.confirmed ? null : "A probable match: confirm it on Today",
    o.hint === "possible_opt_out" ? "Possible opt-out: read it" : o.hint === "invite" ? "A calendar invitation" : null,
    o.subject && `"${o.subject}"`,
    o.bounce_code,
    o.sentiment ? SENTIMENTS[o.sentiment] : null,
    o.kind === "reply" && answered?.sent_at
      ? `${replyTimeWords(answered.sent_at, o.received_at)} after the ${answered.channel === "letter" ? "letter" : "email"}`
      : null,
    o.summary,
    filesWords(o.attachments),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A bounce or an automatic reply, inside the email it answers. */
function Attached({ o, c }: { o: Outcome; c: Ctx }) {
  return (
    <div className="dk-att">
      <p className="m">
        <span className={`dk-chip ${outcomeChip(o).cls}`}>{outcomeChip(o).word}</span> {stampWords(o.received_at)}
        {o.kind === "bounce"
          ? ` · ${[o.bounced_address, o.bounce_code].filter(Boolean).join(" · ") || "an address was refused"}`
          : ` · ${[c.name(o.contact_id) ?? o.from_name ?? o.from_address, o.subject && `"${o.subject}"`].filter(Boolean).join(" · ")}`}
      </p>
      <FullText body={o.body_text} />
      <Del
        action={deskDeleteOutcome}
        field="outcome"
        id={o.id}
        back={c.back}
        target={c.target}
        confirm
        label={`Delete this ${o.kind === "bounce" ? "bounce" : "automatic reply"}`}
      />
    </div>
  );
}

function ContactRow({ item, c }: { item: ContactItem; c: Ctx }) {
  if (item.type === "touch") {
    const x = item.touch;
    const chip = touchChip(x);
    return (
      <li data-tl={x.channel}>
        <span className="d">{stampWords(item.at)}</span>
        <span className="c">
          <span className={`dk-chip ${chip.cls}`}>{chip.word}</span>
        </span>
        <div className="b">
          <p className="t">{touchTitle(x, c)}</p>
          {touchMeta(x) && <p className="m">{touchMeta(x)}</p>}
          <OutlookLink link={x.web_link} />
          <FullText body={x.body_text} />
          {item.attached.map((o) => (
            <Attached key={o.id} o={o} c={c} />
          ))}
        </div>
        <span className="x">
          <Del action={deskDeleteTouch} field="touch" id={x.id} back={c.back} target={c.target} confirm />
        </span>
      </li>
    );
  }
  const o = item.outcome;
  const chip = outcomeChip(o);
  return (
    <li data-tl={o.kind}>
      <span className="d">{stampWords(item.at)}</span>
      <span className="c">
        <span className={`dk-chip ${chip.cls}`}>{chip.word}</span>
      </span>
      <div className="b">
        <p className="t">{outcomeTitle(o, c)}</p>
        {outcomeMeta(o, c) && <p className="m">{outcomeMeta(o, c)}</p>}
        <OutlookLink link={o.web_link} />
        <FullText body={o.body_text} />
      </div>
      <span className="x">
        <Del action={deskDeleteOutcome} field="outcome" id={o.id} back={c.back} target={c.target} confirm />
      </span>
    </li>
  );
}

/** One email inside a meeting: a line, with the full text a click away. */
function MeetingEmail({ item, c }: { item: ContactItem; c: Ctx }) {
  const chip = item.type === "touch" ? touchChip(item.touch) : outcomeChip(item.outcome);
  const title = item.type === "touch" ? touchTitle(item.touch, c) : outcomeTitle(item.outcome, c);
  const subject = item.type === "touch" ? item.touch.subject : item.outcome.subject;
  const body = item.type === "touch" ? item.touch.body_text : item.outcome.body_text;
  const link = item.type === "touch" ? item.touch.web_link : item.outcome.web_link;
  return (
    <li>
      <p className="m">
        <span className={`dk-chip ${chip.cls}`}>{chip.word}</span> {stampWords(item.at)} · {title}
        {subject ? ` · "${subject}"` : ""}
        {link ? (
          <>
            {" · "}
            <a href={link} target="_blank" rel="noreferrer">
              Outlook
            </a>
          </>
        ) : null}
      </p>
      <FullText body={body} />
      {item.type === "touch" && item.attached.map((o) => <Attached key={o.id} o={o} c={c} />)}
    </li>
  );
}

function MeetingNote({ n, c }: { n: Note; c: Ctx }) {
  return (
    <li>
      <p className="m">
        {n.title ?? `${NOTE_KINDS[n.kind]} notes`} · {stampWords(n.happened_at)}
        {n.source === "assistant" ? " · from Alex" : n.source === "import" ? " · from the outreach log" : ""}
      </p>
      <p className="dk-notes">{n.body}</p>
      <Del action={deskDeleteNote} field="note" id={n.id} back={c.back} target={c.target} confirm={false} label="Delete these notes" />
    </li>
  );
}

function actionWords(a: Action): string {
  const when = a.starts_at ? `${dayWords(a.starts_at)} ${timeWords(a.starts_at)}` : a.due_on ? `due ${dateWords(a.due_on)}` : null;
  return [a.title, when, a.status === "done" ? "done" : a.status === "cancelled" ? "dropped" : null].filter(Boolean).join(" · ");
}

function MeetingRow({ m, c }: { m: Meeting; c: Ctx }) {
  const word = meetingWords(m);
  const what = m.kind === "call" ? "call" : "meeting";
  const counts = [
    m.emails.length ? `${m.emails.length} ${m.emails.length === 1 ? "email" : "emails"}` : null,
    m.notes.length ? "notes" : m.state === "held" ? "no notes yet" : null,
    m.actions.length ? `${m.actions.length} ${m.actions.length === 1 ? "action point" : "action points"}` : null,
  ].filter(Boolean);
  const title = m.action?.title && !/^(call|meeting) with /i.test(m.action.title) ? m.action.title : null;
  // notes and action points made here are tied to this meeting (when it was booked on the desk)
  const tie = m.action?.id ?? null;
  return (
    <li className={`dk-meet ${m.state}`} data-tl={`${m.kind}-${m.state}`}>
      <span className="d">{stampWords(m.at)}</span>
      <span className="c">
        <span className={`dk-chip ${m.state === "booked" ? "meet-booked" : m.state === "cancelled" ? "cancelled" : "meet"}`}>
          {m.state === "booked" ? "Booked" : m.state === "cancelled" ? "Cancelled" : m.kind === "call" ? "Call" : "Meeting"}
        </span>
      </span>
      <div className="b">
        <p className="t">
          {word}
          {m.state !== "cancelled" ? `, ${dayWords(m.at)} ${timeWords(m.at)}` : ""}
        </p>
        <p className="m">{[title, ...counts].filter(Boolean).join(" · ") || (m.state === "booked" ? "Notes go in here after it." : "")}</p>
        <details className="dk-meet-in">
          <summary>{m.state === "booked" ? "Open" : `Open the ${what}`}</summary>
          {m.emails.length > 0 && (
            <>
              <h4 className="dk-label">How it was arranged</h4>
              <ul className="dk-meet-list">
                {m.emails.map((e) => (
                  <MeetingEmail key={e.type === "touch" ? `t-${e.touch.id}` : `o-${e.outcome.id}`} item={e} c={c} />
                ))}
              </ul>
            </>
          )}
          {m.touch && (
            <>
              <h4 className="dk-label">Logged</h4>
              <p className="m">{touchTitle(m.touch, c)}</p>
              {m.touch.body_text && <p className="dk-notes">{m.touch.body_text}</p>}
              <Del action={deskDeleteTouch} field="touch" id={m.touch.id} back={c.back} target={c.target} confirm label="Delete what was logged" />
            </>
          )}
          <h4 className="dk-label">Notes</h4>
          {m.notes.length ? (
            <ul className="dk-meet-list">
              {m.notes.map((n) => (
                <MeetingNote key={n.id} n={n} c={c} />
              ))}
            </ul>
          ) : (
            <p className="m">{m.state === "booked" ? "None yet. Add them after it." : "None yet."}</p>
          )}
          {m.state !== "cancelled" && (
            <form action={deskAddNote} className="dk-form dk-meet-form">
              <input type="hidden" name="target" value={c.target} />
              <input type="hidden" name="back" value={c.back} />
              <input type="hidden" name="kind" value={m.kind} />
              {tie ? <input type="hidden" name="meeting" value={tie} /> : <input type="hidden" name="happened_at_iso" value={m.at} />}
              <label className="dk-field wide">
                <span>Add notes to this {what}</span>
                <textarea name="body" rows={3} required />
              </label>
              <div className="dk-form-foot">
                <DeskSubmit className="dk-btn sm" busy="Saving…">
                  Save notes
                </DeskSubmit>
              </div>
            </form>
          )}
          <h4 className="dk-label">Action points</h4>
          {m.actions.length ? (
            <ul className="dk-meet-list">
              {m.actions.map((a) => (
                <li key={a.id}>
                  <p className="m">{actionWords(a)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m">None.</p>
          )}
          {tie && m.state !== "cancelled" && (
            <form action={deskAddAction} className="dk-form dk-meet-form">
              <input type="hidden" name="target" value={c.target} />
              <input type="hidden" name="back" value={c.back} />
              <input type="hidden" name="meeting" value={tie} />
              <input type="hidden" name="kind" value="task" />
              <label className="dk-field wide">
                <span>Add an action point from it</span>
                <input type="text" name="title" required maxLength={300} />
              </label>
              <label className="dk-field">
                <span>Due</span>
                <input type="date" name="due_on" />
              </label>
              <div className="dk-form-foot">
                <DeskSubmit className="dk-btn sm" busy="Adding…">
                  Add action point
                </DeskSubmit>
              </div>
            </form>
          )}
          {m.action && (
            <div className="dk-bar" style={{ marginTop: 10 }}>
              {m.state === "booked" && (
                <form action={deskSetAction}>
                  <input type="hidden" name="action" value={m.action.id} />
                  <input type="hidden" name="back" value={c.back} />
                  <DeskSubmit className="dk-btn sm" name="op" value="cancel" busy="Saving…">
                    {`Cancel the ${what}`}
                  </DeskSubmit>
                </form>
              )}
              {m.state === "cancelled" && (
                <form action={deskSetAction}>
                  <input type="hidden" name="action" value={m.action.id} />
                  <input type="hidden" name="back" value={c.back} />
                  <DeskSubmit className="dk-btn sm" name="op" value="reopen" busy="Saving…">
                    {`It's on again`}
                  </DeskSubmit>
                </form>
              )}
              <Del action={deskDeleteAction} field="action" id={m.action.id} back={c.back} target={c.target} confirm label={`Delete the ${what}`} />
            </div>
          )}
        </details>
      </div>
      <span className="x" />
    </li>
  );
}

function WhatsAppRow({ n, c }: { n: Note; c: Ctx }) {
  return (
    <li data-tl="whatsapp">
      <span className="d">{stampWords(n.happened_at)}</span>
      <span className="c">
        <span className="dk-chip sent">WhatsApp</span>
      </span>
      <div className="b">
        <p className="t">{n.title ?? "WhatsApp"}</p>
        {n.source === "assistant" && <p className="m">From Alex</p>}
        <FullText body={n.body} label="Show the messages" />
      </div>
      <span className="x">
        <Del action={deskDeleteNote} field="note" id={n.id} back={c.back} target={c.target} confirm={false} />
      </span>
    </li>
  );
}

function Entry({ e, c }: { e: TimelineEntry; c: Ctx }) {
  if (e.type === "meeting") return <MeetingRow m={e.meeting} c={c} />;
  if (e.type === "whatsapp") return <WhatsAppRow n={e.note} c={c} />;
  return <ContactRow item={e} c={c} />;
}

export function TimelinePanel({
  timeline,
  target,
  back,
  contactName,
  touches,
}: {
  timeline: Timeline;
  target: string;
  back: string;
  contactName: Map<string, string>;
  touches: Touch[];
}) {
  const c: Ctx = { target, back, touches, name: (id) => (id ? (contactName.get(id) ?? null) : null) };
  return (
    <section className="dk-panel" aria-labelledby="tl-h">
      <div className="dk-panel-h">
        <h2 id="tl-h">Timeline</h2>
        <span className="count">{timeline.entries.length}</span>
      </div>
      {timeline.entries.length === 0 ? (
        <p className="dk-empty">Nothing yet. Log the first email or letter above.</p>
      ) : (
        <ul className="dk-tl">
          {timeline.entries.map((e) => (
            <Entry
              key={
                e.type === "meeting"
                  ? `m-${e.meeting.key}`
                  : e.type === "whatsapp"
                    ? `w-${e.note.id}`
                    : e.type === "touch"
                      ? `t-${e.touch.id}`
                      : `o-${e.outcome.id}`
              }
              e={e}
              c={c}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function NotesPanel({ notes, target, back }: { notes: Note[]; target: string; back: string }) {
  return (
    <section className="dk-panel" aria-labelledby="nn-h">
      <div className="dk-panel-h">
        <h2 id="nn-h">Notes</h2>
        <span className="count">{notes.length}</span>
      </div>
      {notes.length === 0 ? (
        <p className="dk-empty">None. Notes about a meeting or call go inside it on the timeline.</p>
      ) : (
        <ul className="dk-list">
          {notes.map((n) => (
            <li key={n.id}>
              <div>
                <p className="t">{n.title ?? "Note"}</p>
                <p className="m">
                  {stampWords(n.happened_at)}
                  {n.source === "assistant" ? " · from Alex" : n.source === "import" ? " · from the outreach log" : ""}
                </p>
                <p className="dk-notes" style={{ marginTop: 6 }}>
                  {n.body}
                </p>
                <Del action={deskDeleteNote} field="note" id={n.id} back={back} target={target} confirm={false} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
