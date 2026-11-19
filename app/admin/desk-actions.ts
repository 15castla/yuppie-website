"use server";

// The Outreach Desk's actions (17 Nov 2026). Each one checks the desk team (requireDesk(): signed in, an admin, aal2,
// the owner or desk access; since 19 Nov 2026 Kira has the same powers as Albert; linking the Outlook drafter stays the
// owner's, requireOwner()), saves through the service role, writes one admin_audit row (ids and field names only, never
// names, addresses or message text) and sends the browser back with ?done= or ?error= (lib/server/outreach/model.ts
// DONE_WORDS and ERROR_WORDS). Plain forms, so they work before any JavaScript loads. Nothing here sends anything.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { audit } from "@/lib/server/audit";
import { serviceDb } from "@/lib/server/db";
import { afterBounce, afterOutreachTouch, afterReply, nextStep, setStage, stopFollowups } from "@/lib/server/outreach/desk";
import { loadTeam } from "@/lib/server/outreach/team";
import { effects, ensureContact } from "@/lib/server/outreach/drafter";
import { importDesk, parseImport } from "@/lib/server/outreach/import";
import {
  ACTION_KINDS,
  ASKS,
  BEFORE_CALL,
  CATEGORIES,
  CHANNELS,
  EXCLUSIVITY,
  MAILBOX_TYPES,
  NOTE_KINDS,
  OUTCOME_CHANNELS,
  OUTCOME_KINDS,
  OUTREACH_KINDS,
  SENTIMENTS,
  SIGNERS,
  SOURCES,
  STAGES,
  TOUCH_KINDS,
  isKey,
  type Followup,
  type Target,
} from "@/lib/server/outreach/model";
import { addWorkingDays, isoDate, januaryDay, ukDate, ukLocalToIso } from "@/lib/server/outreach/rules";
import { requireDesk, requireOwner } from "./require-owner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

function text(fd: FormData, key: string, max = 2000): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function longText(fd: FormData, key: string): string | null {
  return text(fd, key, 200_000);
}

function choice<T extends object>(fd: FormData, key: string, map: T, fallback: keyof T): keyof T {
  const v = text(fd, key, 60);
  return isKey(map, v) ? v : fallback;
}

function ticked(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "yes" || v === "true" || v === "1";
}

function idOf(fd: FormData, key: string): string | null {
  const v = text(fd, key, 60);
  return v && UUID.test(v) ? v : null;
}

function emailOf(value: string | null): string | null | false {
  if (!value) return null;
  const e = value.trim().toLowerCase();
  return EMAIL.test(e) && e.length <= 254 ? e : false;
}

/** Domains from "padium.com, www.padium.com https://urbangreens.co.uk/". */
function domainsOf(value: string | null): string[] {
  if (!value) return [];
  const out = new Set<string>();
  for (const raw of value.split(/[\s,;]+/)) {
    const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^.*@/, "").replace(/\/.*$/, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) out.add(d);
  }
  return [...out].slice(0, 20);
}

/** Where to send the browser back to: a desk page (with the RM shown, ?rm=AC), never anywhere else. */
function backTo(fd: FormData, fallback = "/admin/desk"): string {
  const v = text(fd, "back", 300);
  return v && /^\/admin\/desk(\/[A-Za-z0-9/_-]*)?(\?rm=(all|[A-Z]{2,3}))?$/.test(v) ? v : fallback;
}

function go(path: string, param: "done" | "error", code: string): never {
  revalidatePath("/admin/desk", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${param}=${encodeURIComponent(code)}`);
}

async function targetOf(id: string | null): Promise<Target | null> {
  if (!id) return null;
  const { data } = await serviceDb().from("outreach_targets").select("*").eq("id", id).maybeSingle();
  return (data as Target | null) ?? null;
}

function targetFields(fd: FormData) {
  return {
    name: text(fd, "name", 200),
    group_name: text(fd, "group_name", 200),
    category: choice(fd, "category", CATEGORIES, "other"),
    domains: domainsOf(text(fd, "domains", 1000)),
    website: text(fd, "website", 500),
    postal_address: text(fd, "postal_address", 1000),
    ask: choice(fd, "ask", ASKS, "discount"),
    ask_detail: text(fd, "ask_detail", 4000),
    ask_line: text(fd, "ask_line", 300),
    exclusivity: choice(fd, "exclusivity", EXCLUSIVITY, "none"),
    exclusivity_category: text(fd, "exclusivity_category", 200),
    hook: text(fd, "hook", 4000),
    avoid: text(fd, "avoid", 4000),
    notes: longText(fd, "notes"),
  };
}

/** The Relationship Manager chosen on the form: someone on the desk team (19 Nov 2026), else `fallback`. */
async function rmOf(fd: FormData, fallback: string | null): Promise<string | null> {
  const id = idOf(fd, "rm");
  if (!id) return fallback;
  const team = await loadTeam();
  return team.some((m) => m.id === id) ? id : fallback;
}

// ---------------------------------------------------------------------------------------------- partners

/** New partner (and optionally its first contact). */
export async function deskCreateTarget(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const fields = targetFields(fd);
  if (!fields.name) go("/admin/desk/new", "error", "missing");
  const stage = choice(fd, "stage", STAGES, "researching");
  const contactEmail = emailOf(text(fd, "contact_email", 254));
  if (contactEmail === false) go("/admin/desk/new", "error", "bad_email");
  const db = serviceDb();
  // a new partner's RM is whoever adds it, unless they choose someone else
  const rm = await rmOf(fd, me.id);
  const { data, error } = await db.from("outreach_targets").insert({ ...fields, stage, rm }).select("id").single();
  if (error || !data) go("/admin/desk/new", "error", "failed");
  await db.from("outreach_stage_history").insert({ target_id: data.id, from_stage: null, to_stage: stage, by: "albert" });
  const contactName = text(fd, "contact_name", 200);
  if (contactName || contactEmail) {
    await db.from("outreach_contacts").insert({
      target_id: data.id,
      name: contactName,
      role: text(fd, "contact_role", 200),
      mailbox_type: choice(fd, "contact_mailbox_type", MAILBOX_TYPES, "named_person"),
      email: contactEmail || null,
      email_source: choice(fd, "contact_source", SOURCES, "unknown"),
      source_note: text(fd, "contact_source_note", 1000),
      is_primary: true,
    });
  }
  await audit(me.id, "desk.target.create", { type: "outreach_target", id: data.id }, { contact: Boolean(contactName || contactEmail) });
  go(`/admin/desk/t/${data.id}`, "done", "created");
}

export async function deskUpdateTarget(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const fields = { ...targetFields(fd), rm: await rmOf(fd, target.rm ?? null) };
  if (!fields.name) go(back, "error", "missing");
  const { error } = await serviceDb().from("outreach_targets").update(fields).eq("id", target.id);
  if (error) go(back, "error", "failed");
  const changed = Object.keys(fields).filter((k) => JSON.stringify(fields[k as keyof typeof fields]) !== JSON.stringify(target[k as keyof Target] ?? null));
  await audit(me.id, "desk.target.update", { type: "outreach_target", id: target.id }, { fields: changed });
  go(back, "done", "saved");
}

/** The stage, and the next call's time when a call is booked. */
export async function deskSetStage(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const stage = choice(fd, "stage", STAGES, target.stage);
  const callRaw = text(fd, "next_call_at", 40);
  const callAt = callRaw ? ukLocalToIso(callRaw) : null;
  if (callRaw && !callAt) go(back, "error", "bad_date");
  const db = serviceDb();
  await setStage(db, target, stage, "albert", text(fd, "note", 500));
  if (callAt || ticked(fd, "clear_call")) {
    await db.from("outreach_targets").update({ next_call_at: callAt }).eq("id", target.id);
    if (callAt) await db.from("outreach_actions").insert({ target_id: target.id, kind: "call", title: `Call with ${target.name}`, starts_at: callAt });
  }
  await audit(me.id, "desk.target.stage", { type: "outreach_target", id: target.id }, { from: target.stage, to: stage, call: Boolean(callAt) });
  go(back, "done", "stage");
}

/** Do not follow up, and opted out (the whole business), on or off. */
export async function deskSetFlags(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const op = text(fd, "op", 30);
  const db = serviceDb();
  if (op === "no_follow_up" || op === "follow_up") {
    await db.from("outreach_targets").update({ do_not_follow_up: op === "no_follow_up" }).eq("id", target.id);
    if (op === "no_follow_up") await stopFollowups(db, target.id, "manual");
  } else if (op === "opt_out") {
    await db.from("outreach_targets").update({ opted_out: true, opted_out_at: new Date().toISOString(), opted_out_note: text(fd, "note", 500) }).eq("id", target.id);
    await stopFollowups(db, target.id, "opted_out");
  } else if (op === "opt_in") {
    await db.from("outreach_targets").update({ opted_out: false, opted_out_at: null, opted_out_note: null }).eq("id", target.id);
  } else go(back, "error", "missing");
  await audit(me.id, `desk.target.${op}`, { type: "outreach_target", id: target.id }, {});
  go(back, "done", "flags");
}

/** Deletes a partner and everything about them (contacts, emails, letters, replies, notes, actions). */
export async function deskDeleteTarget(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  if (text(fd, "confirm", 20) !== "delete") go(`/admin/desk/t/${target.id}`, "error", "confirm");
  const { error } = await serviceDb().from("outreach_targets").delete().eq("id", target.id);
  if (error) go(`/admin/desk/t/${target.id}`, "error", "failed");
  await audit(me.id, "desk.target.delete", { type: "outreach_target", id: target.id }, {});
  go("/admin/desk", "done", "deleted");
}

// ---------------------------------------------------------------------------------------------- contacts

export async function deskSaveContact(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const id = idOf(fd, "contact");
  const email = emailOf(text(fd, "email", 254));
  if (email === false) go(back, "error", "bad_email");
  const name = text(fd, "name", 200);
  if (!name && !email) go(back, "error", "missing");
  const optedOut = ticked(fd, "opted_out");
  const fields = {
    name,
    role: text(fd, "role", 200),
    mailbox_type: choice(fd, "mailbox_type", MAILBOX_TYPES, "named_person"),
    email: email || null,
    email_source: choice(fd, "email_source", SOURCES, "unknown"),
    source_note: text(fd, "source_note", 1000),
    linkedin_url: text(fd, "linkedin_url", 500),
    is_primary: ticked(fd, "is_primary"),
  };
  const db = serviceDb();
  if (email) {
    const { data: same } = await db.from("outreach_contacts").select("id").eq("target_id", target.id).eq("email", email).maybeSingle();
    if (same && same.id !== id) go(back, "error", "duplicate");
  }
  if (fields.is_primary) await db.from("outreach_contacts").update({ is_primary: false }).eq("target_id", target.id);
  let contactId = id;
  if (id) {
    const { data: before } = await db.from("outreach_contacts").select("opted_out").eq("id", id).eq("target_id", target.id).maybeSingle();
    if (!before) go(back, "error", "not_found");
    const optFields = optedOut === before.opted_out ? {} : optedOut ? { opted_out: true, opted_out_at: new Date().toISOString() } : { opted_out: false, opted_out_at: null };
    const { error } = await db.from("outreach_contacts").update({ ...fields, ...optFields }).eq("id", id);
    if (error) go(back, "error", "failed");
  } else {
    const { data, error } = await db
      .from("outreach_contacts")
      .insert({ ...fields, target_id: target.id, ...(optedOut ? { opted_out: true, opted_out_at: new Date().toISOString() } : {}) })
      .select("id")
      .single();
    if (error || !data) go(back, "error", "failed");
    contactId = data.id;
  }
  if (optedOut) await stopFollowups(db, target.id, "opted_out");
  await audit(me.id, id ? "desk.contact.update" : "desk.contact.create", { type: "outreach_contact", id: contactId }, { target: target.id, opted_out: optedOut });
  go(back, "done", "contact");
}

/** Deletes a person: their contact row goes, and their address and words are cleared from the emails they're on. */
export async function deskDeleteContact(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  const id = idOf(fd, "contact");
  if (!target || !id) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  if (text(fd, "confirm", 20) !== "delete") go(back, "error", "confirm");
  const db = serviceDb();
  const { data: contact } = await db.from("outreach_contacts").select("id, email").eq("id", id).eq("target_id", target.id).maybeSingle();
  if (!contact) go(back, "error", "not_found");
  await db.from("outreach_touch_recipients").update({ address: null }).eq("contact_id", id);
  if (contact.email) {
    const { data: touches } = await db.from("outreach_touches").select("id").eq("target_id", target.id);
    const ids = (touches ?? []).map((t) => t.id);
    if (ids.length) await db.from("outreach_touch_recipients").update({ address: null }).in("touch_id", ids).eq("address", contact.email);
    await db.from("outreach_outcomes").update({ bounced_address: null }).eq("target_id", target.id).eq("bounced_address", contact.email);
  }
  await db.from("outreach_outcomes").update({ from_address: null, from_name: null, subject: null, body_text: null, body_html: null, summary: null }).eq("contact_id", id);
  const { error } = await db.from("outreach_contacts").delete().eq("id", id);
  if (error) go(back, "error", "failed");
  await audit(me.id, "desk.contact.delete", { type: "outreach_contact", id }, { target: target.id });
  go(back, "done", "contact_deleted");
}

// ---------------------------------------------------------------------------------------------- touches

function idsOf(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && UUID.test(v));
}

/**
 * Logs something we sent or did: an email, a letter (posted), a LinkedIn message, a call, a WhatsApp, a meeting.
 * A first touch starts a sequence and schedules its follow-up; a follow-up closes its step.
 */
export async function deskLogTouch(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const channel = choice(fd, "channel", CHANNELS, "email");
  const kind = choice(fd, "kind", TOUCH_KINDS, "first");
  const db = serviceDb();
  const isOutreach = OUTREACH_KINDS.includes(kind);
  if (isOutreach && target.opted_out) go(back, "error", "opted_out");

  // when: a letter's posted date, otherwise the date and time it went
  let sentAt: string | null;
  let postedOn: string | null = null;
  if (channel === "letter") {
    postedOn = isoDate(text(fd, "posted_on", 20));
    if (!postedOn) go(back, "error", "bad_date");
    sentAt = new Date(`${postedOn}T12:00:00Z`).toISOString();
  } else {
    const raw = text(fd, "sent_at", 40);
    sentAt = raw ? ukLocalToIso(raw) : new Date().toISOString();
    if (!sentAt) go(back, "error", "bad_date");
  }

  // who: chosen contacts, plus a new address typed in
  const { data: contactRows } = await db.from("outreach_contacts").select("id, email, opted_out").eq("target_id", target.id);
  const contacts = new Map((contactRows ?? []).map((c) => [c.id, c]));
  const to = idsOf(fd, "to").filter((id) => contacts.has(id));
  const cc = idsOf(fd, "cc").filter((id) => contacts.has(id) && !to.includes(id));
  const newEmail = emailOf(text(fd, "new_email", 254));
  if (newEmail === false) go(back, "error", "bad_email");
  if (newEmail) {
    const existing = (contactRows ?? []).find((c) => c.email === newEmail);
    if (existing) to.push(existing.id);
    else {
      const { data: made, error } = await db
        .from("outreach_contacts")
        .insert({
          target_id: target.id,
          name: text(fd, "new_name", 200),
          role: text(fd, "new_role", 200),
          email: newEmail,
          mailbox_type: choice(fd, "new_mailbox_type", MAILBOX_TYPES, "named_person"),
          email_source: choice(fd, "new_source", SOURCES, "unknown"),
          source_note: text(fd, "new_source_note", 1000),
        })
        .select("id, email, opted_out")
        .single();
      if (error || !made) go(back, "error", "failed");
      contacts.set(made.id, made);
      to.push(made.id);
    }
  }
  if (isOutreach && [...to, ...cc].some((id) => contacts.get(id)?.opted_out)) go(back, "error", "opted_out");
  if (channel === "email" && to.length === 0) go(back, "error", "no_recipient");

  // which approach: a first touch starts one; anything else joins the chosen (or the newest) one
  const id = randomUUID();
  let sequenceId: string = id;
  if (kind !== "first") {
    const chosen = idOf(fd, "sequence");
    const { data: seqRows } = await db.from("outreach_touches").select("sequence_id, sent_at").eq("target_id", target.id).order("sent_at", { ascending: false, nullsFirst: false }).limit(200);
    const known = new Set((seqRows ?? []).map((r) => r.sequence_id));
    const pick = chosen && known.has(chosen) ? chosen : seqRows?.[0]?.sequence_id;
    if (!pick) go(back, "error", "no_sequence");
    sequenceId = pick;
  }
  const step = kind === "first" ? 0 : kind === "follow_up" ? await nextStep(db, sequenceId) : null;
  const status = channel === "letter" ? "posted" : "sent";
  const { error } = await db.from("outreach_touches").insert({
    id,
    target_id: target.id,
    sequence_id: sequenceId,
    channel,
    kind,
    step,
    status,
    subject: text(fd, "subject", 500),
    version: text(fd, "version", 40),
    attachment: text(fd, "attachment", 500),
    file_ref: text(fd, "file_ref", 1000),
    body_text: longText(fd, "body_text"),
    sent_at: sentAt,
    letter_posted_on: postedOn,
    letter_class: channel === "letter" ? (text(fd, "letter_class", 20) === "second" ? "second" : text(fd, "letter_class", 20) === "signed_for" ? "signed_for" : "first") : null,
    // the form sends a hidden "off" and the box's "on" when ticked
    counts_in_stats: fd.has("counts_in_stats") ? fd.getAll("counts_in_stats").includes("on") : true,
    signed_by: choice(fd, "signed_by", SIGNERS, target.signed_by),
    note: text(fd, "note", 4000),
    created_by: "albert",
  });
  if (error) go(back, "error", "failed");
  const recipients = [
    ...to.map((cid) => ({ touch_id: id, contact_id: cid, address: contacts.get(cid)?.email ?? null, role: "to" })),
    ...cc.map((cid) => ({ touch_id: id, contact_id: cid, address: contacts.get(cid)?.email ?? null, role: "cc" })),
  ];
  if (recipients.length) await db.from("outreach_touch_recipients").insert(recipients);
  if (isOutreach) await afterOutreachTouch(db, { id, target_id: target.id, sequence_id: sequenceId, channel, kind, step, sent_at: sentAt }, target);
  await audit(me.id, "desk.touch.create", { type: "outreach_touch", id }, { target: target.id, channel, kind, step, recipients: recipients.length });
  go(back, "done", "touch");
}

export async function deskDeleteTouch(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  const id = idOf(fd, "touch");
  if (!target || !id) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  if (text(fd, "confirm", 20) !== "delete") go(back, "error", "confirm");
  const db = serviceDb();
  const { data: touch } = await db.from("outreach_touches").select("id, sequence_id, kind").eq("id", id).eq("target_id", target.id).maybeSingle();
  if (!touch) go(back, "error", "not_found");
  // a first touch takes its whole approach with it (its follow-ups and the outcomes logged against it)
  if (touch.kind === "first") {
    await db.from("outreach_followups").delete().eq("sequence_id", touch.sequence_id);
    await db.from("outreach_outcomes").delete().eq("sequence_id", touch.sequence_id);
    await db.from("outreach_touches").delete().eq("sequence_id", touch.sequence_id);
  } else {
    await db.from("outreach_followups").update({ touch_id: null }).eq("touch_id", id);
    await db.from("outreach_touches").delete().eq("id", id);
  }
  await audit(me.id, "desk.touch.delete", { type: "outreach_touch", id }, { target: target.id, kind: touch.kind });
  go(back, "done", "saved");
}

// ---------------------------------------------------------------------------------------------- outcomes

/**
 * Logs something that came back: a reply (with how it went), an automatic reply, a bounce, a delay notice, or a
 * request to stop. A reply stops that approach's follow-ups; a bounce marks the address; a request to stop (or the
 * "opted out" tick) opts the person out and stops everything. A call booked sets the stage and the next call.
 */
export async function deskLogOutcome(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const kind = choice(fd, "kind", OUTCOME_KINDS, "reply");
  const channel = choice(fd, "channel", OUTCOME_CHANNELS, "email");
  const receivedRaw = text(fd, "received_at", 40);
  const receivedAt = receivedRaw ? ukLocalToIso(receivedRaw) : new Date().toISOString();
  if (!receivedAt) go(back, "error", "bad_date");
  const callRaw = text(fd, "call_at", 40);
  const callAt = callRaw ? ukLocalToIso(callRaw) : null;
  if (callRaw && !callAt) go(back, "error", "bad_date");
  const db = serviceDb();

  // who it came from: a contact, or a new person (an assistant, a colleague)
  let contactId = idOf(fd, "from_contact");
  let contact: { id: string; email: string | null; name: string | null } | null = null;
  if (contactId) {
    const { data } = await db.from("outreach_contacts").select("id, email, name").eq("id", contactId).eq("target_id", target.id).maybeSingle();
    contact = data;
    if (!contact) contactId = null;
  }
  const newEmail = emailOf(text(fd, "new_email", 254));
  if (newEmail === false) go(back, "error", "bad_email");
  const newName = text(fd, "new_name", 200);
  if (!contact && (newEmail || newName)) {
    const existing = newEmail ? (await db.from("outreach_contacts").select("id, email, name").eq("target_id", target.id).eq("email", newEmail).maybeSingle()).data : null;
    if (existing) contact = existing;
    else {
      const { data: made, error } = await db
        .from("outreach_contacts")
        .insert({ target_id: target.id, name: newName, role: text(fd, "new_role", 200), email: newEmail || null, mailbox_type: "named_person", email_source: newEmail ? "their_reply" : "unknown" })
        .select("id, email, name")
        .single();
      if (error || !made) go(back, "error", "failed");
      contact = made;
    }
    contactId = contact.id;
  }

  // what it answers: the chosen touch, else the newest outreach touch sent before it arrived
  let touchId = idOf(fd, "touch");
  let sequenceId: string | null = null;
  const { data: touchRows } = await db.from("outreach_touches").select("id, sequence_id, sent_at, kind").eq("target_id", target.id).order("sent_at", { ascending: false, nullsFirst: false });
  const touches = touchRows ?? [];
  const chosen = touchId ? touches.find((t) => t.id === touchId) : undefined;
  const answered = chosen ?? touches.find((t) => OUTREACH_KINDS.includes(t.kind) && t.sent_at && t.sent_at <= receivedAt) ?? touches.find((t) => OUTREACH_KINDS.includes(t.kind));
  touchId = answered?.id ?? null;
  sequenceId = answered?.sequence_id ?? null;

  const bounced = kind === "bounce" ? (emailOf(text(fd, "bounced_address", 254)) || contact?.email || null) : null;
  const sentiment = kind === "reply" && isKey(SENTIMENTS, text(fd, "sentiment", 20)) ? text(fd, "sentiment", 20) : null;
  const id = randomUUID();
  const { error } = await db.from("outreach_outcomes").insert({
    id,
    target_id: target.id,
    sequence_id: sequenceId,
    touch_id: touchId,
    contact_id: contactId,
    kind,
    channel,
    sentiment,
    received_at: receivedAt,
    from_address: contact?.email ?? newEmail ?? null,
    from_name: contact?.name ?? newName ?? null,
    subject: text(fd, "subject", 500),
    body_text: longText(fd, "body_text"),
    summary: text(fd, "summary", 4000),
    bounced_address: bounced,
    bounce_code: kind === "bounce" ? text(fd, "bounce_code", 40) : null,
    match_method: "manual",
    confirmed: true,
    created_by: "albert",
  });
  if (error) go(back, "error", "failed");

  if (kind === "reply") await afterReply(db, { id, target_id: target.id, sequence_id: sequenceId, touch_id: touchId, received_at: receivedAt }, target);
  if (kind === "bounce") await afterBounce(db, target.id, sequenceId, bounced, text(fd, "bounce_code", 40), receivedAt);
  if (kind === "opt_out_request" || ticked(fd, "opted_out")) {
    if (contactId) await db.from("outreach_contacts").update({ opted_out: true, opted_out_at: receivedAt }).eq("id", contactId);
    else await db.from("outreach_targets").update({ opted_out: true, opted_out_at: receivedAt }).eq("id", target.id);
    await stopFollowups(db, target.id, "opted_out");
  }
  if (callAt) {
    const { data: fresh } = await db.from("outreach_targets").select("id, stage").eq("id", target.id).single();
    if (fresh && !["in_talks", "agreed", "live"].includes(fresh.stage)) await setStage(db, fresh, "call_booked");
    await db.from("outreach_targets").update({ next_call_at: callAt }).eq("id", target.id);
    await db.from("outreach_actions").insert({ target_id: target.id, kind: "call", title: `Call with ${contact?.name ?? target.name}`, starts_at: callAt });
  }
  await audit(me.id, "desk.outcome.create", { type: "outreach_outcome", id }, { target: target.id, kind, channel, call: Boolean(callAt) });
  go(back, "done", "outcome");
}

export async function deskDeleteOutcome(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  const id = idOf(fd, "outcome");
  if (!target || !id) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  if (text(fd, "confirm", 20) !== "delete") go(back, "error", "confirm");
  const { error } = await serviceDb().from("outreach_outcomes").delete().eq("id", id).eq("target_id", target.id);
  if (error) go(back, "error", "failed");
  await audit(me.id, "desk.outcome.delete", { type: "outreach_outcome", id }, { target: target.id });
  go(back, "done", "saved");
}

// ---------------------------------------------------------------------------------------------- notes and action points

export async function deskAddNote(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const body = longText(fd, "body");
  if (!body) go(back, "error", "missing");
  const db = serviceDb();
  // notes made inside a meeting on the timeline are tied to it, and dated when it happened
  const meeting = await meetingOf(fd, target.id);
  const whenRaw = text(fd, "happened_at", 40);
  const iso = text(fd, "happened_at_iso", 40);
  const happenedAt = meeting ? meeting.starts_at : iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : whenRaw ? ukLocalToIso(whenRaw) : new Date().toISOString();
  if (!happenedAt) go(back, "error", "bad_date");
  const kind = meeting ? meeting.kind : choice(fd, "kind", NOTE_KINDS, "note");
  const { data, error } = await db
    .from("outreach_notes")
    .insert({ target_id: target.id, kind, happened_at: happenedAt, title: text(fd, "title", 300), body, source: "albert", meeting_id: meeting?.id ?? null })
    .select("id")
    .single();
  if (error || !data) go(back, "error", "failed");
  await audit(me.id, "desk.note.create", { type: "outreach_note", id: data.id }, { target: target.id, meeting: Boolean(meeting) });
  go(back, "done", "note");
}

export async function deskDeleteNote(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  const id = idOf(fd, "note");
  if (!target || !id) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const { error } = await serviceDb().from("outreach_notes").delete().eq("id", id).eq("target_id", target.id);
  if (error) go(back, "error", "failed");
  await audit(me.id, "desk.note.delete", { type: "outreach_note", id }, { target: target.id });
  go(back, "done", "note_deleted");
}

export async function deskAddAction(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const title = text(fd, "title", 300);
  if (!title) go(back, "error", "missing");
  const dueRaw = text(fd, "due_on", 20);
  const dueOn = dueRaw ? isoDate(dueRaw) : null;
  const startsRaw = text(fd, "starts_at", 40);
  const startsAt = startsRaw ? ukLocalToIso(startsRaw) : null;
  if ((dueRaw && !dueOn) || (startsRaw && !startsAt)) go(back, "error", "bad_date");
  const meeting = await meetingOf(fd, target.id);
  const { data, error } = await serviceDb()
    .from("outreach_actions")
    .insert({ target_id: target.id, kind: choice(fd, "kind", ACTION_KINDS, "task"), title, due_on: dueOn, starts_at: startsAt, source: "albert", meeting_id: meeting?.id ?? null })
    .select("id")
    .single();
  if (error || !data) go(back, "error", "failed");
  await audit(me.id, "desk.action.create", { type: "outreach_action", id: data.id }, { target: target.id, meeting: Boolean(meeting) });
  go(back, "done", "action");
}

/** A meeting or call on this partner (an action point of kind meeting or call with a time), from the form's "meeting". */
async function meetingOf(fd: FormData, targetId: string): Promise<{ id: string; kind: "meeting" | "call"; starts_at: string } | null> {
  const id = idOf(fd, "meeting");
  if (!id) return null;
  const { data } = await serviceDb().from("outreach_actions").select("id, kind, starts_at").eq("id", id).eq("target_id", targetId).in("kind", ["meeting", "call"]).not("starts_at", "is", null).maybeSingle();
  return (data as { id: string; kind: "meeting" | "call"; starts_at: string } | null) ?? null;
}

/**
 * Books a meeting or call (19 Nov 2026): one item on the timeline, "Meeting booked" until it happens, then "Meeting",
 * holding the emails that arranged it, its notes and action points. A time already past logs one that happened. A
 * partner not yet at Call booked moves there.
 */
export async function deskBookMeeting(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  if (!target) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  const kind = text(fd, "kind", 20) === "call" ? "call" : "meeting";
  const whenRaw = text(fd, "starts_at", 40);
  if (!whenRaw) go(back, "error", "missing");
  const startsAt = ukLocalToIso(whenRaw);
  if (!startsAt) go(back, "error", "bad_date");
  const now = new Date().toISOString();
  const past = startsAt <= now;
  const db = serviceDb();
  const { data, error } = await db
    .from("outreach_actions")
    .insert({
      target_id: target.id,
      kind,
      title: text(fd, "title", 300) ?? `${kind === "call" ? "Call" : "Meeting"} with ${target.name}`,
      starts_at: startsAt,
      status: past ? "done" : "open",
      done_at: past ? now : null,
      source: "albert",
    })
    .select("id")
    .single();
  if (error || !data) go(back, "error", "failed");
  const notes = longText(fd, "notes");
  if (notes) await db.from("outreach_notes").insert({ target_id: target.id, kind, happened_at: startsAt, body: notes, source: "albert", meeting_id: data.id });
  if (BEFORE_CALL.includes(target.stage)) await setStage(db, target, "call_booked");
  await audit(me.id, "desk.meeting.book", { type: "outreach_action", id: data.id }, { target: target.id, kind, past, notes: Boolean(notes) });
  go(back, "done", past ? "meeting_logged" : "meeting");
}

/** Deletes an action point, or a meeting or call (its notes and action points stay, no longer tied to it). */
export async function deskDeleteAction(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const target = await targetOf(idOf(fd, "target"));
  const id = idOf(fd, "action");
  if (!target || !id) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${target.id}`);
  if (text(fd, "confirm", 20) !== "delete") go(back, "error", "confirm");
  const { data, error } = await serviceDb().from("outreach_actions").delete().eq("id", id).eq("target_id", target.id).select("id, kind");
  if (error) go(back, "error", "failed");
  if (!data?.length) go(back, "error", "not_found");
  await audit(me.id, "desk.action.delete", { type: "outreach_action", id }, { target: target.id, kind: data[0].kind });
  go(back, "done", "action_deleted");
}

export async function deskSetAction(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "action");
  if (!id) go("/admin/desk", "error", "not_found");
  const db = serviceDb();
  const { data: action } = await db.from("outreach_actions").select("id, target_id").eq("id", id).maybeSingle();
  if (!action) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${action.target_id}`);
  const op = text(fd, "op", 20);
  const patch =
    op === "done" ? { status: "done", done_at: new Date().toISOString() } : op === "cancel" ? { status: "cancelled", done_at: new Date().toISOString() } : op === "reopen" ? { status: "open", done_at: null } : null;
  if (!patch) go(back, "error", "missing");
  await db.from("outreach_actions").update(patch).eq("id", id);
  await audit(me.id, `desk.action.${op}`, { type: "outreach_action", id }, { target: action.target_id });
  go(back, "done", op === "done" ? "action_done" : op === "cancel" ? "meeting_cancelled" : "saved");
}

// ---------------------------------------------------------------------------------------------- follow-ups

/** Snooze to a date, take a snooze off, skip this step, pause, resume or stop a follow-up. */
export async function deskFollowup(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "followup");
  if (!id) go("/admin/desk", "error", "not_found");
  const db = serviceDb();
  const { data } = await db.from("outreach_followups").select("*").eq("id", id).maybeSingle();
  const f = data as Followup | null;
  if (!f) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${f.target_id}`);
  const op = text(fd, "op", 20);
  const today = ukDate();
  if (op === "snooze") {
    const until = isoDate(text(fd, "until", 20));
    if (!until) go(back, "error", "bad_date");
    await db.from("outreach_followups").update({ snoozed_until: until }).eq("id", id);
  } else if (op === "unsnooze") {
    await db.from("outreach_followups").update({ snoozed_until: null }).eq("id", id);
  } else if (op === "skip") {
    await db.from("outreach_followups").update({ status: "skipped", reason: "manual" }).eq("id", id);
    // skipping the follow-up still leaves the January email
    if (f.step === 1) {
      const { data: has } = await db.from("outreach_followups").select("id").eq("sequence_id", f.sequence_id).eq("step", 2).maybeSingle();
      const { data: target } = await db.from("outreach_targets").select("do_not_follow_up, opted_out").eq("id", f.target_id).single();
      const day = januaryDay(today);
      if (!has && day && target && !target.do_not_follow_up && !target.opted_out) {
        await db.from("outreach_followups").insert({ target_id: f.target_id, sequence_id: f.sequence_id, step: 2, channel: "email", due_on: day });
      }
    }
  } else if (op === "pause") {
    await db.from("outreach_followups").update({ status: "paused", reason: "manual" }).eq("target_id", f.target_id).eq("sequence_id", f.sequence_id).in("status", ["scheduled"]);
  } else if (op === "resume") {
    const next = addWorkingDays(today, 1);
    const { data: paused } = await db.from("outreach_followups").select("*").eq("sequence_id", f.sequence_id).eq("status", "paused");
    for (const p of (paused ?? []) as Followup[]) {
      await db.from("outreach_followups").update({ status: "scheduled", reason: null, snoozed_until: p.due_on < next ? next : p.snoozed_until }).eq("id", p.id);
    }
  } else if (op === "stop") {
    await stopFollowups(db, f.target_id, "manual", f.sequence_id);
  } else go(back, "error", "missing");
  await audit(me.id, `desk.followup.${op}`, { type: "outreach_followup", id }, { target: f.target_id });
  go(back, "done", "followup");
}

// ---------------------------------------------------------------------------------------------- import

/** The copy from Outreach_Log: a JSON file Claude builds (never in git), checked in the preview, imported once. */
export async function deskImport(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) go("/admin/desk/settings", "error", "bad_file");
  let parsed;
  try {
    parsed = parseImport(JSON.parse(await file.text()));
  } catch {
    go("/admin/desk/settings", "error", "bad_file");
  }
  if (!parsed.ok) go("/admin/desk/settings", "error", "bad_file");
  const result = await importDesk(serviceDb(), parsed.data, me.id);
  await audit(me.id, "desk.import", { type: "outreach_import", id: null }, result);
  go("/admin/desk/settings", "done", result.targets === 0 && result.skipped > 0 ? "import_nothing_new" : "imported");
}

/** Rates a reply: positive, neutral or negative (the positive rate counts the first reply of each approach). */
export async function deskRateOutcome(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "outcome");
  if (!id) go("/admin/desk", "error", "not_found");
  const db = serviceDb();
  const { data: outcome } = await db.from("outreach_outcomes").select("id, target_id").eq("id", id).maybeSingle();
  if (!outcome) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${outcome.target_id}`);
  const sentiment = text(fd, "sentiment", 20);
  if (!isKey(SENTIMENTS, sentiment)) go(back, "error", "missing");
  await db.from("outreach_outcomes").update({ sentiment }).eq("id", id);
  await audit(me.id, "desk.outcome.rate", { type: "outreach_outcome", id }, { target: outcome.target_id, sentiment });
  go(back, "done", "saved");
}

// ---------------------------------------------------------------------------------------------- Outlook (Phase 2)

/** Links the drafter on the Mac: Albert pastes the fingerprint "draft-partner-emails desk-link" showed (never the key). */
export async function deskLinkDrafter(fd: FormData): Promise<void> {
  const me = await requireOwner();
  const fp = (text(fd, "fingerprint", 200) ?? "").replace(/[\s:]/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fp)) go("/admin/desk/settings", "error", "bad_fingerprint");
  const db = serviceDb();
  await db.from("outreach_drafter_keys").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
  const { data, error } = await db.from("outreach_drafter_keys").insert({ key_hash: fp, created_by: me.id, label: text(fd, "label", 60) ?? "Albert's Mac" }).select("id").single();
  if (error || !data) go("/admin/desk/settings", "error", "failed");
  await audit(me.id, "desk.drafter.link", { type: "outreach_drafter_key", id: data.id }, {});
  go("/admin/desk/settings", "done", "linked");
}

/** Unlinks the drafter at once: its next call gets "not linked". */
export async function deskUnlinkDrafter(): Promise<void> {
  const me = await requireOwner();
  const { data } = await serviceDb().from("outreach_drafter_keys").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null).select("id");
  await audit(me.id, "desk.drafter.unlink", { type: "outreach_drafter_key", id: data?.[0]?.id ?? null }, { keys: data?.length ?? 0 });
  go("/admin/desk/settings", "done", "unlinked");
}

/**
 * The words of a follow-up (Albert's now; Alex's from Phase 3). The drafter puts them into an Outlook draft in the
 * thread, with the first email's attachment, the evening before it is due. Nothing is sent.
 */
export async function deskSaveFollowupText(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "followup");
  if (!id) go("/admin/desk", "error", "not_found");
  const db = serviceDb();
  const { data: f } = await db.from("outreach_followups").select("id, target_id, step, status").eq("id", id).maybeSingle();
  if (!f) go("/admin/desk", "error", "not_found");
  const back = backTo(fd, `/admin/desk/t/${f.target_id}`);
  if (f.status === "drafted") go(back, "error", "drafted_already");
  if (f.status !== "scheduled" && f.status !== "paused") go(back, "error", "not_open");
  const body = text(fd, "body", 20000);
  if (!body) {
    await db.from("outreach_draft_texts").update({ status: "discarded" }).eq("followup_id", id).neq("status", "discarded");
    await audit(me.id, "desk.followup.text_remove", { type: "outreach_followup", id }, { target: f.target_id });
    go(back, "done", "text_removed");
  }
  const subject = text(fd, "subject", 300);
  const kind = f.step === 2 ? "january" : "follow_up";
  const { data: existing } = await db.from("outreach_draft_texts").select("id").eq("followup_id", id).maybeSingle();
  const row = { target_id: f.target_id, followup_id: id, kind, subject, body, status: "written", written_by: "albert" };
  const { error } = existing ? await db.from("outreach_draft_texts").update(row).eq("id", existing.id) : await db.from("outreach_draft_texts").insert(row);
  if (error) go(back, "error", "failed");
  await db.from("outreach_followups").update({ draft_error: null }).eq("id", id);
  await audit(me.id, "desk.followup.text", { type: "outreach_followup", id }, { target: f.target_id, chars: body.length });
  go(back, "done", "text");
}

/** After a failed or deleted draft: make it again at the next sync. */
export async function deskRetryDraft(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "followup");
  if (!id) go("/admin/desk", "error", "not_found");
  const db = serviceDb();
  const { data: f } = await db.from("outreach_followups").select("id, target_id").eq("id", id).maybeSingle();
  if (!f) go("/admin/desk", "error", "not_found");
  await db.from("outreach_followups").update({ draft_error: null }).eq("id", id);
  await audit(me.id, "desk.followup.retry", { type: "outreach_followup", id }, { target: f.target_id });
  go(backTo(fd, `/admin/desk/t/${f.target_id}`), "done", "retry");
}

async function ignore(imid: string | null, kind: "incoming" | "sent") {
  if (imid) await serviceDb().from("outreach_ignored_messages").upsert({ internet_message_id: imid, kind }, { onConflict: "internet_message_id" });
}

/** The review list: a probable reply (matched by the sender's domain only, or to two partners) is confirmed. */
export async function deskConfirmOutcome(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "outcome");
  if (!id) go("/admin/desk/today", "error", "not_found");
  const db = serviceDb();
  const { data: o } = await db.from("outreach_outcomes").select("*").eq("id", id).maybeSingle();
  if (!o) go("/admin/desk/today", "error", "not_found");
  const back = backTo(fd, "/admin/desk/today");
  const target = (await targetOf(idOf(fd, "target"))) ?? (await targetOf(o.target_id));
  if (!target) go(back, "error", "not_found");
  const patch: Record<string, unknown> = { confirmed: true, candidate_targets: [] };
  let sequenceId: string | null = o.sequence_id;
  let touchId: string | null = o.touch_id;
  if (target.id !== o.target_id) {
    // another partner: the email it answers is that partner's newest one before it arrived
    const { data: t } = await db.from("outreach_touches").select("id, sequence_id").eq("target_id", target.id).in("status", ["sent", "posted"]).in("kind", OUTREACH_KINDS as unknown as string[])
      .lte("sent_at", o.received_at).order("sent_at", { ascending: false }).limit(1).maybeSingle();
    sequenceId = t?.sequence_id ?? null;
    touchId = t?.id ?? null;
    Object.assign(patch, { target_id: target.id, sequence_id: sequenceId, touch_id: touchId, contact_id: null, match_method: "manual" });
  }
  if (o.kind === "reply" && o.from_address) patch.contact_id = await ensureContact(db, target.id, { address: o.from_address, name: o.from_name }, "their_reply");
  const { error } = await db.from("outreach_outcomes").update(patch).eq("id", id);
  if (error) go(back, "error", "failed");
  await effects(db, { id, target_id: target.id, sequence_id: sequenceId, touch_id: touchId, received_at: o.received_at, kind: o.kind, bounced_address: o.bounced_address, bounce_code: o.bounce_code }, "albert");
  await audit(me.id, "desk.outcome.confirm", { type: "outreach_outcome", id }, { target: target.id, moved: target.id !== o.target_id });
  go(back, "done", "confirmed");
}

/** The review list: not a reply from a partner. Removed, and never brought back by the drafter. */
export async function deskIgnoreOutcome(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "outcome");
  if (!id) go("/admin/desk/today", "error", "not_found");
  const db = serviceDb();
  const { data: o } = await db.from("outreach_outcomes").select("id, target_id, internet_message_id, confirmed").eq("id", id).maybeSingle();
  if (!o || o.confirmed) go("/admin/desk/today", "error", "not_found");
  await ignore(o.internet_message_id, "incoming");
  await db.from("outreach_outcomes").delete().eq("id", id);
  await audit(me.id, "desk.outcome.ignore", { type: "outreach_outcome", id }, { target: o.target_id });
  go(backTo(fd, "/admin/desk/today"), "done", "ignored");
}

/**
 * The review list: an email Albert sent that the drafter found in Sent Items (typed by hand, so not tracked). Albert
 * says what it was and whose; then it counts like any other email and the follow-ups follow.
 */
export async function deskConfirmTouch(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "touch");
  if (!id) go("/admin/desk/today", "error", "not_found");
  const db = serviceDb();
  const { data: t } = await db.from("outreach_touches").select("*").eq("id", id).maybeSingle();
  if (!t || t.status !== "unconfirmed") go("/admin/desk/today", "error", "not_found");
  const back = backTo(fd, "/admin/desk/today");
  const target = (await targetOf(idOf(fd, "target"))) ?? (await targetOf(t.target_id));
  if (!target) go(back, "error", "not_found");
  const kind = choice(fd, "kind", TOUCH_KINDS, (t.guess_kind as keyof typeof TOUCH_KINDS) ?? "first");
  let sequenceId: string = id;
  if (kind !== "first") {
    // the thread it was in, else the partner's newest sequence; with none, it starts one
    const { data: same } = t.conversation_id
      ? await db.from("outreach_touches").select("sequence_id").eq("target_id", target.id).eq("conversation_id", t.conversation_id).neq("id", id).limit(1).maybeSingle()
      : { data: null };
    const { data: newest } = await db.from("outreach_touches").select("sequence_id").eq("target_id", target.id).in("status", ["sent", "posted"]).neq("id", id)
      .order("sent_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    sequenceId = same?.sequence_id ?? newest?.sequence_id ?? id;
  }
  const finalKind = sequenceId === id ? "first" : kind;
  const step = finalKind === "first" ? 0 : finalKind === "follow_up" ? await nextStep(db, sequenceId) : null;
  const { error } = await db.from("outreach_touches").update({
    status: "sent", kind: finalKind, step, sequence_id: sequenceId, target_id: target.id, guess_kind: null, candidate_targets: [],
  }).eq("id", id);
  if (error) go(back, "error", "failed");
  if (target.id !== t.target_id) {
    // the addresses become the new partner's contacts when they are at its domain
    const { data: recips } = await db.from("outreach_touch_recipients").select("id, address").eq("touch_id", id);
    for (const r of recips ?? []) {
      const at = r.address && (target.domains ?? []).includes(String(r.address).split("@")[1]);
      await db.from("outreach_touch_recipients").update({ contact_id: at ? await ensureContact(db, target.id, { address: r.address, name: null }, "unknown") : null }).eq("id", r.id);
    }
  }
  if (OUTREACH_KINDS.includes(finalKind)) {
    await afterOutreachTouch(db, { id, target_id: target.id, sequence_id: sequenceId, channel: "email", kind: finalKind, step, sent_at: t.sent_at }, target);
  }
  await audit(me.id, "desk.touch.confirm", { type: "outreach_touch", id }, { target: target.id, kind: finalKind });
  go(back, "done", "confirmed");
}

/** The review list: not outreach (a personal email to someone at a partner, say). Removed, never brought back. */
export async function deskIgnoreTouch(fd: FormData): Promise<void> {
  const me = await requireDesk();
  const id = idOf(fd, "touch");
  if (!id) go("/admin/desk/today", "error", "not_found");
  const db = serviceDb();
  const { data: t } = await db.from("outreach_touches").select("id, target_id, internet_message_id, status").eq("id", id).maybeSingle();
  if (!t || t.status !== "unconfirmed") go("/admin/desk/today", "error", "not_found");
  await ignore(t.internet_message_id, "sent");
  await db.from("outreach_touches").delete().eq("id", id);
  await audit(me.id, "desk.touch.ignore", { type: "outreach_touch", id }, { target: t.target_id });
  go(backTo(fd, "/admin/desk/today"), "done", "ignored");
}
