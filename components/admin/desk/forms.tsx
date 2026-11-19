import type { ReactNode } from "react";

import {
  deskAddAction,
  deskAddNote,
  deskBookMeeting,
  deskCreateTarget,
  deskLogOutcome,
  deskLogTouch,
  deskSaveContact,
  deskSetStage,
  deskUpdateTarget,
} from "@/app/admin/desk-actions";
import {
  ACTION_KINDS,
  ASKS,
  CATEGORIES,
  EXCLUSIVITY,
  MAILBOX_TYPES,
  NOTE_KINDS,
  OUTCOME_CHANNELS,
  OUTCOME_KINDS,
  SENTIMENTS,
  SOURCES,
  STAGES,
  TOUCH_KINDS,
  type Contact,
  type Target,
  type Touch,
} from "@/lib/server/outreach/model";
import type { TeamMember } from "@/lib/server/outreach/rm";
import { isoToUkLocal, ukDate } from "@/lib/server/outreach/rules";
import type { Meeting } from "@/lib/server/outreach/timeline";
import { dayWords, shortDate, timeWords } from "./format";
import { DeskSubmit } from "./submit";

// The desk's forms (17 Nov 2026; plan 5.4). Plain server-action forms (they work before JavaScript loads), each in a
// drawer on the partner's page. Field names match app/admin/desk-actions.ts.

function Options({ map, none }: { map: Record<string, string>; none?: string }) {
  return (
    <>
      {none !== undefined && <option value="">{none}</option>}
      {Object.entries(map).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </>
  );
}

export function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={`dk-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Drawer({ id, title, open, hint, children }: { id?: string; title: string; open?: boolean; hint?: string; children: ReactNode }) {
  return (
    <details className="dk-drawer" id={id} open={open}>
      <summary>{title}</summary>
      <div>
        {hint && <small className="hint">{hint}</small>}
        {children}
      </div>
    </details>
  );
}

function Hidden({ target, back }: { target: string; back: string }) {
  return (
    <>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}

function contactLabel(c: Contact): string {
  const who = c.name ? `${c.name}${c.role ? `, ${c.role}` : ""}` : (c.email ?? "");
  return c.name && c.email ? `${who} <${c.email}>` : who;
}

/** The Relationship Manager (19 Nov 2026): who on the desk looks after this partner. */
function RmField({ team, value }: { team: TeamMember[]; value: string | null }) {
  return (
    <Field label="Relationship Manager" hint="Who looks after this partner">
      <select name="rm" defaultValue={value ?? ""}>
        {!value && <option value="">Nobody yet</option>}
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.initials} · {m.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** The partner's details: used to add a partner and to edit one. */
export function TargetFields({ t, team, rm }: { t?: Target; team: TeamMember[]; rm: string | null }) {
  return (
    <>
      <Field label="Name">
        <input type="text" name="name" required maxLength={200} defaultValue={t?.name ?? ""} />
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={t?.category ?? "other"}>
          <Options map={CATEGORIES} />
        </select>
      </Field>
      <Field label="Group or owner company">
        <input type="text" name="group_name" maxLength={200} defaultValue={t?.group_name ?? ""} />
      </Field>
      <Field label="Email domains" hint="For matching replies later, such as padium.com">
        <input type="text" name="domains" maxLength={1000} defaultValue={t?.domains.join(", ") ?? ""} />
      </Field>
      <Field label="Website">
        <input type="url" name="website" maxLength={500} defaultValue={t?.website ?? ""} />
      </Field>
      <Field label="Postal address" hint="A business or registered office address">
        <textarea name="postal_address" rows={3} maxLength={1000} defaultValue={t?.postal_address ?? ""} />
      </Field>
      <Field label="The ask">
        <select name="ask" defaultValue={t?.ask ?? "discount"}>
          <Options map={ASKS} />
        </select>
      </Field>
      <Field label="The ask in a few words" hint="Used in follow-ups: a members' discount at Rosa's Thai">
        <input type="text" name="ask_line" maxLength={300} defaultValue={t?.ask_line ?? ""} />
      </Field>
      <Field label="Exclusivity">
        <select name="exclusivity" defaultValue={t?.exclusivity ?? "none"}>
          <Options map={EXCLUSIVITY} />
        </select>
      </Field>
      <Field label="Exclusive category" hint="Narrow: men's grooming, shirts, padel">
        <input type="text" name="exclusivity_category" maxLength={200} defaultValue={t?.exclusivity_category ?? ""} />
      </Field>
      <RmField team={team} value={rm} />
      <Field label="The ask in full" wide>
        <textarea name="ask_detail" rows={3} maxLength={4000} defaultValue={t?.ask_detail ?? ""} />
      </Field>
      <Field label="Hook" wide>
        <textarea name="hook" rows={2} maxLength={4000} defaultValue={t?.hook ?? ""} />
      </Field>
      <Field label="Don't mention" wide>
        <textarea name="avoid" rows={2} maxLength={4000} defaultValue={t?.avoid ?? ""} />
      </Field>
      <Field label="Notes" wide>
        <textarea name="notes" rows={4} defaultValue={t?.notes ?? ""} />
      </Field>
    </>
  );
}

export function NewTargetForm({ team, me }: { team: TeamMember[]; me: string }) {
  return (
    <form action={deskCreateTarget} className="dk-form">
      <TargetFields team={team} rm={me} />
      <Field label="Stage">
        <select name="stage" defaultValue="researching">
          <Options map={STAGES} />
        </select>
      </Field>
      <fieldset className="dk-fieldset">
        <legend>First contact (optional)</legend>
        <div className="dk-form" style={{ width: "100%" }}>
          <ContactFields prefix="contact_" />
        </div>
      </fieldset>
      <div className="dk-form-foot">
        <DeskSubmit className="dk-btn primary" busy="Adding…">
          Add partner
        </DeskSubmit>
      </div>
    </form>
  );
}

export function EditTargetForm({ t, back, team }: { t: Target; back: string; team: TeamMember[] }) {
  return (
    <form action={deskUpdateTarget} className="dk-form">
      <Hidden target={t.id} back={back} />
      <TargetFields t={t} team={team} rm={t.rm ?? null} />
      <div className="dk-form-foot">
        <DeskSubmit className="dk-btn primary" busy="Saving…">
          Save
        </DeskSubmit>
      </div>
    </form>
  );
}

/** A contact's fields; prefix "contact_" on the new-partner form. */
export function ContactFields({ c, prefix = "" }: { c?: Contact; prefix?: string }) {
  const n = (k: string) => (prefix ? `${prefix}${k === "email_source" ? "source" : k}` : k);
  return (
    <>
      <Field label="Name">
        <input type="text" name={n("name")} maxLength={200} defaultValue={c?.name ?? ""} />
      </Field>
      <Field label="Role">
        <input type="text" name={n("role")} maxLength={200} defaultValue={c?.role ?? ""} />
      </Field>
      <Field label="Email">
        <input type="email" name={n("email")} maxLength={254} defaultValue={c?.email ?? ""} />
      </Field>
      <Field label="Mailbox type">
        <select name={n("mailbox_type")} defaultValue={c?.mailbox_type ?? "named_person"}>
          <Options map={MAILBOX_TYPES} />
        </select>
      </Field>
      <Field label="Where the address came from">
        <select name={n("email_source")} defaultValue={c?.email_source ?? "unknown"}>
          <Options map={SOURCES} />
        </select>
      </Field>
      <Field label="Source note" hint="RocketReach grade A, checked 11 Nov">
        <input type="text" name={n("source_note")} maxLength={1000} defaultValue={c?.source_note ?? ""} />
      </Field>
      {!prefix && (
        <>
          <Field label="LinkedIn profile">
            <input type="url" name="linkedin_url" maxLength={500} defaultValue={c?.linkedin_url ?? ""} />
          </Field>
          <div className="dk-field">
            <span>&nbsp;</span>
            <label className="dk-check">
              <input type="checkbox" name="is_primary" defaultChecked={c?.is_primary} /> Main contact
            </label>
            <label className="dk-check">
              <input type="checkbox" name="opted_out" defaultChecked={c?.opted_out} /> Opted out (never contact again)
            </label>
          </div>
        </>
      )}
    </>
  );
}

export function ContactForm({ target, back, c }: { target: string; back: string; c?: Contact }) {
  return (
    <form action={deskSaveContact} className="dk-form">
      <Hidden target={target} back={back} />
      {c && <input type="hidden" name="contact" value={c.id} />}
      <ContactFields c={c} />
      <div className="dk-form-foot">
        <DeskSubmit className="dk-btn primary" busy="Saving…">
          {c ? "Save contact" : "Add contact"}
        </DeskSubmit>
      </div>
    </form>
  );
}

function Recipients({ contacts, emailOnly }: { contacts: Contact[]; emailOnly: boolean }) {
  const list = contacts.filter((c) => !emailOnly || c.email);
  if (list.length === 0) return <p className="dim wide">No contacts with an email yet: add the address below.</p>;
  return (
    <fieldset className="dk-fieldset">
      <legend>Who</legend>
      {list.map((c) => (
        <span key={c.id} style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
          <label className="dk-check">
            <input type="checkbox" name="to" value={c.id} disabled={c.opted_out} defaultChecked={list.length === 1 && !c.opted_out} /> {contactLabel(c)}
            {c.opted_out ? " (opted out)" : c.email_status === "bounced" ? " (bounced)" : ""}
          </label>
          {emailOnly && (
            <label className="dk-check dim">
              <input type="checkbox" name="cc" value={c.id} disabled={c.opted_out} /> cc
            </label>
          )}
        </span>
      ))}
    </fieldset>
  );
}

function NewAddress() {
  return (
    <fieldset className="dk-fieldset">
      <legend>Or a new address</legend>
      <div className="dk-form" style={{ width: "100%" }}>
        <Field label="Email">
          <input type="email" name="new_email" maxLength={254} />
        </Field>
        <Field label="Name">
          <input type="text" name="new_name" maxLength={200} />
        </Field>
        <Field label="Role">
          <input type="text" name="new_role" maxLength={200} />
        </Field>
        <Field label="Mailbox type">
          <select name="new_mailbox_type" defaultValue="named_person">
            <Options map={MAILBOX_TYPES} />
          </select>
        </Field>
        <Field label="Where it came from">
          <select name="new_source" defaultValue="unknown">
            <Options map={SOURCES} />
          </select>
        </Field>
        <Field label="Source note">
          <input type="text" name="new_source_note" maxLength={1000} />
        </Field>
      </div>
    </fieldset>
  );
}

type Sequence = { id: string; label: string };

/** The approaches so far, newest first, for a follow-up, resend or reply to belong to. */
export function sequencesFor(touches: Touch[]): Sequence[] {
  const firsts = touches.filter((t) => t.kind === "first" && t.sent_at).sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  return firsts.map((t) => ({ id: t.sequence_id, label: `${t.channel === "letter" ? "Letter" : "Email"} of ${shortDate(t.sent_at!)}${t.subject ? `: ${t.subject.slice(0, 50)}` : ""}` }));
}

function SequencePick({ sequences }: { sequences: Sequence[] }) {
  if (sequences.length < 2) return null;
  return (
    <Field label="Part of">
      <select name="sequence" defaultValue={sequences[0].id}>
        {sequences.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function LogEmailForm({ target, back, contacts, touches }: { target: Target; back: string; contacts: Contact[]; touches: Touch[] }) {
  const sequences = sequencesFor(touches);
  return (
    <form action={deskLogTouch} className="dk-form">
      <Hidden target={target.id} back={back} />
      <input type="hidden" name="channel" value="email" />
      <Field label="What it was">
        <select name="kind" defaultValue={sequences.length ? "follow_up" : "first"}>
          <Options map={TOUCH_KINDS} />
        </select>
      </Field>
      <SequencePick sequences={sequences} />
      <Field label="Sent">
        <input type="datetime-local" name="sent_at" defaultValue={isoToUkLocal(new Date().toISOString())} />
      </Field>
      <Recipients contacts={contacts} emailOnly />
      <NewAddress />
      <Field label="Subject" wide>
        <input type="text" name="subject" maxLength={500} />
      </Field>
      <Field label="Version">
        <input type="text" name="version" maxLength={40} placeholder="v1" />
      </Field>
      <Field label="Attachment">
        <input type="text" name="attachment" maxLength={500} placeholder="Club Yuppie x Brand - partner overview.pdf" />
      </Field>
      <Field label="The email" wide hint="Paste the whole email: the desk keeps every communication in full">
        <textarea name="body_text" rows={6} />
      </Field>
      <Field label="Note" wide>
        <input type="text" name="note" maxLength={4000} />
      </Field>
      <div className="dk-form-foot">
        <input type="hidden" name="counts_in_stats" value="off" />
        <label className="dk-check">
          <input type="checkbox" name="counts_in_stats" value="on" defaultChecked /> Counts in the numbers
        </label>
        <DeskSubmit className="dk-btn primary" busy="Logging…">
          Log email
        </DeskSubmit>
      </div>
    </form>
  );
}

export function LetterForm({ target, back, contacts, touches }: { target: Target; back: string; contacts: Contact[]; touches: Touch[] }) {
  const sequences = sequencesFor(touches);
  return (
    <form action={deskLogTouch} className="dk-form">
      <Hidden target={target.id} back={back} />
      <input type="hidden" name="channel" value="letter" />
      <Field label="What it was">
        <select name="kind" defaultValue="first">
          <Options map={TOUCH_KINDS} />
        </select>
      </Field>
      <SequencePick sequences={sequences} />
      <Field label="Posted on">
        <input type="date" name="posted_on" required defaultValue={ukDate()} />
      </Field>
      <Field label="Post">
        <select name="letter_class" defaultValue="first">
          <option value="first">First class</option>
          <option value="second">Second class</option>
          <option value="signed_for">Signed for</option>
        </select>
      </Field>
      <Recipients contacts={contacts} emailOnly={false} />
      <Field label="Version">
        <input type="text" name="version" maxLength={40} />
      </Field>
      <Field label="Letter file">
        <input type="text" name="attachment" maxLength={500} placeholder="Club-Yuppie-letter-Brand.pdf" />
      </Field>
      <Field label="The letter" wide hint="Paste the letter's text if you'd like it kept here">
        <textarea name="body_text" rows={5} />
      </Field>
      <Field label="Note" wide>
        <input type="text" name="note" maxLength={4000} />
      </Field>
      <div className="dk-form-foot">
        <input type="hidden" name="counts_in_stats" value="off" />
        <label className="dk-check">
          <input type="checkbox" name="counts_in_stats" value="on" defaultChecked /> Counts in the numbers
        </label>
        <DeskSubmit className="dk-btn primary" busy="Logging…">
          Log letter
        </DeskSubmit>
      </div>
    </form>
  );
}

export function OtherTouchForm({ target, back, contacts, touches }: { target: Target; back: string; contacts: Contact[]; touches: Touch[] }) {
  const sequences = sequencesFor(touches);
  return (
    <form action={deskLogTouch} className="dk-form">
      <Hidden target={target.id} back={back} />
      <Field label="How">
        <select name="channel" defaultValue="call">
          <option value="call">Call</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </Field>
      <Field label="What it was">
        <select name="kind" defaultValue={sequences.length ? "conversation" : "first"}>
          <Options map={TOUCH_KINDS} />
        </select>
      </Field>
      <SequencePick sequences={sequences} />
      <Field label="When">
        <input type="datetime-local" name="sent_at" defaultValue={isoToUkLocal(new Date().toISOString())} />
      </Field>
      <Recipients contacts={contacts} emailOnly={false} />
      <Field label="What was said" wide>
        <textarea name="body_text" rows={4} />
      </Field>
      <div className="dk-form-foot">
        <input type="hidden" name="counts_in_stats" value="off" />
        <label className="dk-check">
          <input type="checkbox" name="counts_in_stats" value="on" defaultChecked /> Counts in the numbers
        </label>
        <DeskSubmit className="dk-btn primary" busy="Logging…">
          Log it
        </DeskSubmit>
      </div>
    </form>
  );
}

export function OutcomeForm({ target, back, contacts, touches }: { target: Target; back: string; contacts: Contact[]; touches: Touch[] }) {
  const answerable = touches.filter((t) => t.sent_at).sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  return (
    <form action={deskLogOutcome} className="dk-form">
      <Hidden target={target.id} back={back} />
      <Field label="What came back">
        <select name="kind" defaultValue="reply">
          <Options map={OUTCOME_KINDS} />
        </select>
      </Field>
      <Field label="By">
        <select name="channel" defaultValue="email">
          <Options map={OUTCOME_CHANNELS} />
        </select>
      </Field>
      <Field label="Received">
        <input type="datetime-local" name="received_at" defaultValue={isoToUkLocal(new Date().toISOString())} />
      </Field>
      <Field label="From">
        <select name="from_contact" defaultValue={contacts[0]?.id ?? ""}>
          <option value="">Someone new (below)</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {contactLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Answering">
        <select name="touch" defaultValue="">
          <option value="">The latest before it arrived</option>
          {answerable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.channel === "letter" ? "Letter" : t.channel === "email" ? "Email" : t.channel} of {shortDate(t.sent_at!)}
              {t.subject ? `: ${t.subject.slice(0, 40)}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="How it went">
        <select name="sentiment" defaultValue="">
          <Options map={SENTIMENTS} none="Not rated" />
        </select>
      </Field>
      <fieldset className="dk-fieldset">
        <legend>Someone new (an assistant, a colleague)</legend>
        <div className="dk-form" style={{ width: "100%" }}>
          <Field label="Name">
            <input type="text" name="new_name" maxLength={200} />
          </Field>
          <Field label="Email">
            <input type="email" name="new_email" maxLength={254} />
          </Field>
          <Field label="Role">
            <input type="text" name="new_role" maxLength={200} />
          </Field>
        </div>
      </fieldset>
      <Field label="Subject" wide>
        <input type="text" name="subject" maxLength={500} />
      </Field>
      <Field label="What they wrote" wide hint="Paste the whole email: the desk keeps every communication in full">
        <textarea name="body_text" rows={6} />
      </Field>
      <Field label="Your summary" wide>
        <input type="text" name="summary" maxLength={4000} />
      </Field>
      <Field label="Bounced address" hint="For a bounce">
        <input type="email" name="bounced_address" maxLength={254} />
      </Field>
      <Field label="Bounce code" hint="Such as 5.1.1">
        <input type="text" name="bounce_code" maxLength={40} />
      </Field>
      <Field label="Call booked for" hint="Sets the stage to Call booked">
        <input type="datetime-local" name="call_at" />
      </Field>
      <div className="dk-form-foot">
        <label className="dk-check">
          <input type="checkbox" name="opted_out" /> They asked us to stop (opt them out)
        </label>
        <DeskSubmit className="dk-btn primary" busy="Logging…">
          Log it
        </DeskSubmit>
      </div>
    </form>
  );
}

function meetingOption(m: Meeting): string {
  return `${m.kind === "call" ? "Call" : "Meeting"}, ${dayWords(m.at)} ${timeWords(m.at)}${m.state === "booked" ? " (booked)" : ""}`;
}

export function NoteForm({ target, back, meetings = [] }: { target: string; back: string; meetings?: Meeting[] }) {
  const tied = meetings.filter((m) => m.action && m.state !== "cancelled").sort((a, b) => b.at.localeCompare(a.at));
  return (
    <form action={deskAddNote} className="dk-form">
      <Hidden target={target} back={back} />
      {tied.length > 0 && (
        <Field label="From a meeting or call" hint="Notes from one go inside it on the timeline">
          <select name="meeting" defaultValue="">
            <option value="">Not from one</option>
            {tied.map((m) => (
              <option key={m.key} value={m.action!.id}>
                {meetingOption(m)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Kind">
        <select name="kind" defaultValue="note">
          <Options map={NOTE_KINDS} />
        </select>
      </Field>
      <Field label="When">
        <input type="datetime-local" name="happened_at" defaultValue={isoToUkLocal(new Date().toISOString())} />
      </Field>
      <Field label="Title">
        <input type="text" name="title" maxLength={300} />
      </Field>
      <Field label="Notes" wide>
        <textarea name="body" rows={6} required />
      </Field>
      <div className="dk-form-foot">
        <DeskSubmit className="dk-btn primary" busy="Saving…">
          Save note
        </DeskSubmit>
      </div>
    </form>
  );
}

export function ActionForm({ target, back }: { target: string; back: string }) {
  return (
    <form action={deskAddAction} className="dk-form">
      <Hidden target={target} back={back} />
      <Field label="Kind">
        <select name="kind" defaultValue="task">
          <Options map={ACTION_KINDS} />
        </select>
      </Field>
      <Field label="What" wide>
        <input type="text" name="title" required maxLength={300} />
      </Field>
      <Field label="Due">
        <input type="date" name="due_on" />
      </Field>
      <Field label="Or at" hint="For a call or a meeting">
        <input type="datetime-local" name="starts_at" />
      </Field>
      <div className="dk-form-foot">
        <DeskSubmit className="dk-btn primary" busy="Adding…">
          Add action point
        </DeskSubmit>
      </div>
    </form>
  );
}

export function StageForm({ t, back }: { t: Target; back: string }) {
  return (
    <form action={deskSetStage} className="dk-form">
      <Hidden target={t.id} back={back} />
      <Field label="Stage">
        <select name="stage" defaultValue={t.stage}>
          <Options map={STAGES} />
        </select>
      </Field>
      <Field label="Note">
        <input type="text" name="note" maxLength={500} />
      </Field>
      <div className="dk-form-foot">
        {t.next_call_at && (
          <label className="dk-check">
            <input type="checkbox" name="clear_call" /> Clear the old next call ({dayWords(t.next_call_at)} {timeWords(t.next_call_at)})
          </label>
        )}
        <DeskSubmit className="dk-btn primary" busy="Saving…">
          Save
        </DeskSubmit>
      </div>
    </form>
  );
}

/**
 * Book a meeting or call, or log one that happened (19 Nov 2026): one item on the timeline, "Meeting booked" until it
 * happens and "Meeting" after, with the emails that arranged it, its notes and its action points.
 */
export function BookMeetingForm({ target, back }: { target: Target; back: string }) {
  return (
    <form action={deskBookMeeting} className="dk-form">
      <Hidden target={target.id} back={back} />
      <Field label="What">
        <select name="kind" defaultValue="meeting">
          <option value="meeting">Meeting</option>
          <option value="call">Call</option>
        </select>
      </Field>
      <Field label="When" hint="A time already past logs one that happened">
        <input type="datetime-local" name="starts_at" required />
      </Field>
      <Field label="With or where" hint="Optional: Naomi, at their office">
        <input type="text" name="title" maxLength={300} placeholder={`Meeting with ${target.name}`} />
      </Field>
      <Field label="Notes" wide hint="Optional, for one that happened. Add more on the timeline later.">
        <textarea name="notes" rows={3} />
      </Field>
      <div className="dk-form-foot">
        <DeskSubmit className="dk-btn primary" busy="Saving…">
          Save
        </DeskSubmit>
        <small className="hint">A partner not yet at Call booked moves there.</small>
      </div>
    </form>
  );
}
