// The desk import file (17 Nov 2026): the copy from Outreach_Log, built by Claude from the log, checked by Albert in
// the preview on Desk > Settings, then imported once. Not kept in git (it holds names and addresses). Pure: the
// preview (in the browser) and the import (on the server) both check a file with parseImport().
//
// {
//   "format": "club-yuppie-desk-import", "version": 1,
//   "targets": [{
//     "key": "pall-mall-barbers", "name": "Pall Mall Barbers", "category": "grooming", "stage": "replied", ...target fields,
//     "contacts": [{ "key": "pmb-marketing", "email": "marketing@...", "mailbox_type": "group_mailbox", "email_source": "albert", ... }],
//     "touches":  [{ "key": "pmb-1", "sequence": "pmb-1", "channel": "email", "kind": "first", "sent_at": "2026-11-10T00:56:00Z",
//                    "to": ["pmb-marketing"], "cc": [], "bounced": [], "bounce_code": null, ... }],
//     "outcomes": [{ "key": "pmb-r1", "touch": "pmb-1", "contact": "pmb-richard", "kind": "reply", "sentiment": "positive",
//                    "received_at": "2026-11-10T08:26:00Z", "summary": "..." }],
//     "notes_list": [{ "key": "pmb-n1", "kind": "call", "happened_at": "...", "title": "...", "body": "..." }],
//     "actions":  [{ "key": "pmb-a1", "kind": "task", "title": "...", "due_on": "2026-11-23" }]
//   }]
// }
//
// The partner's free-text "notes" is a field; its dated notes (meetings, calls) are "notes_list".
// Keys only have to be unique within the file; they become each row's import_key ("<file key>"), so a second import
// of the same file finds them and changes nothing.

import {
  ACTION_KINDS,
  ASKS,
  CATEGORIES,
  CHANNELS,
  EXCLUSIVITY,
  MAILBOX_TYPES,
  NOTE_KINDS,
  OUTCOME_CHANNELS,
  OUTCOME_KINDS,
  SENTIMENTS,
  SIGNERS,
  SOURCES,
  STAGES,
  TOUCH_KINDS,
  isKey,
} from "./model";

export type ImportContact = {
  key: string;
  name: string | null;
  role: string | null;
  mailbox_type: keyof typeof MAILBOX_TYPES;
  email: string | null;
  email_source: keyof typeof SOURCES;
  source_note: string | null;
  email_status: "unknown" | "valid" | "bounced";
  linkedin_url: string | null;
  is_primary: boolean;
};
export type ImportTouch = {
  key: string;
  sequence: string;
  channel: keyof typeof CHANNELS;
  kind: keyof typeof TOUCH_KINDS;
  step: number | null;
  status: "sent" | "posted" | "queued" | "drafted" | "planned";
  sent_at: string | null;
  letter_posted_on: string | null;
  subject: string | null;
  version: string | null;
  attachment: string | null;
  file_ref: string | null;
  body_text: string | null;
  counts_in_stats: boolean;
  signed_by: "albert" | "kira" | null;
  note: string | null;
  to: string[];
  cc: string[];
  bounced: string[];
  bounce_code: string | null;
};
export type ImportOutcome = {
  key: string;
  touch: string | null;
  contact: string | null;
  kind: keyof typeof OUTCOME_KINDS;
  channel: keyof typeof OUTCOME_CHANNELS;
  sentiment: keyof typeof SENTIMENTS | null;
  received_at: string;
  subject: string | null;
  body_text: string | null;
  summary: string | null;
  bounce_code: string | null;
};
export type ImportNote = { key: string; kind: keyof typeof NOTE_KINDS; happened_at: string; title: string | null; body: string };
export type ImportAction = { key: string; kind: keyof typeof ACTION_KINDS; title: string; due_on: string | null; starts_at: string | null; status: "open" | "done" };
export type ImportTarget = {
  key: string;
  name: string;
  group_name: string | null;
  category: keyof typeof CATEGORIES;
  domains: string[];
  website: string | null;
  postal_address: string | null;
  ask: keyof typeof ASKS;
  ask_detail: string | null;
  ask_line: string | null;
  exclusivity: keyof typeof EXCLUSIVITY;
  exclusivity_category: string | null;
  signed_by: keyof typeof SIGNERS;
  stage: keyof typeof STAGES;
  next_call_at: string | null;
  hook: string | null;
  avoid: string | null;
  notes: string | null;
  do_not_follow_up: boolean;
  contacts: ImportContact[];
  touches: ImportTouch[];
  outcomes: ImportOutcome[];
  notes_list: ImportNote[];
  actions: ImportAction[];
};
export type ImportFile = { targets: ImportTarget[] };

type Result = { ok: true; data: ImportFile } | { ok: false; problems: string[] };

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks an import file and returns it cleaned, or every problem found (with where). */
export function parseImport(raw: unknown): Result {
  const problems: string[] = [];
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const root = obj(raw);
  if (root.format !== "club-yuppie-desk-import" || root.version !== 1) return { ok: false, problems: ["Not a desk import file (format and version)."] };
  if (!Array.isArray(root.targets)) return { ok: false, problems: ["No targets."] };
  const keys = new Set<string>();
  const str = (v: unknown, where: string, max = 4000, required = false): string | null => {
    if (v === null || v === undefined || v === "") {
      if (required) problems.push(`${where}: missing`);
      return null;
    }
    if (typeof v !== "string") {
      problems.push(`${where}: not text`);
      return null;
    }
    return v.trim().slice(0, max) || null;
  };
  const key = (v: unknown, where: string): string => {
    const k = str(v, where, 120, true) ?? "";
    if (k && keys.has(k)) problems.push(`${where}: key "${k}" used twice`);
    keys.add(k);
    return k;
  };
  const pick = <T extends object>(v: unknown, map: T, where: string, fallback?: keyof T): keyof T => {
    if ((v === undefined || v === null) && fallback !== undefined) return fallback;
    if (!isKey(map, v)) {
      problems.push(`${where}: "${String(v)}" is not one of ${Object.keys(map).join(", ")}`);
      return fallback ?? (Object.keys(map)[0] as keyof T);
    }
    return v;
  };
  const time = (v: unknown, where: string, required = false): string | null => {
    const s = str(v, where, 40, required);
    if (s && !ISO_TIME.test(s)) problems.push(`${where}: not a date and time with a zone`);
    return s && ISO_TIME.test(s) ? new Date(s).toISOString() : null;
  };
  const date = (v: unknown, where: string): string | null => {
    const s = str(v, where, 20);
    if (s && !ISO_DATE.test(s)) problems.push(`${where}: not a date`);
    return s && ISO_DATE.test(s) ? s : null;
  };
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

  const targets: ImportTarget[] = root.targets.map((tRaw, ti) => {
    const t = obj(tRaw);
    const w = `targets[${ti}]${typeof t.name === "string" ? ` (${t.name})` : ""}`;
    const contacts: ImportContact[] = list(t.contacts).map((cRaw, ci) => {
      const c = obj(cRaw);
      const cw = `${w}.contacts[${ci}]`;
      const email = str(c.email, `${cw}.email`, 254)?.toLowerCase() ?? null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`${cw}.email: not an email address`);
      const name = str(c.name, `${cw}.name`, 200);
      if (!name && !email) problems.push(`${cw}: needs a name or an email`);
      const status = c.email_status === "valid" || c.email_status === "bounced" ? c.email_status : "unknown";
      return {
        key: key(c.key, `${cw}.key`),
        name,
        role: str(c.role, `${cw}.role`, 200),
        mailbox_type: pick(c.mailbox_type, MAILBOX_TYPES, `${cw}.mailbox_type`, "named_person"),
        email,
        email_source: pick(c.email_source, SOURCES, `${cw}.email_source`, "unknown"),
        source_note: str(c.source_note, `${cw}.source_note`, 1000),
        email_status: status,
        linkedin_url: str(c.linkedin_url, `${cw}.linkedin_url`, 500),
        is_primary: c.is_primary === true,
      };
    });
    const contactKeys = new Set(contacts.map((c) => c.key));
    const touches: ImportTouch[] = list(t.touches).map((xRaw, xi) => {
      const x = obj(xRaw);
      const xw = `${w}.touches[${xi}]`;
      const channel = pick(x.channel, CHANNELS, `${xw}.channel`);
      const status = x.status === "queued" || x.status === "drafted" || x.status === "planned" ? x.status : channel === "letter" ? "posted" : "sent";
      // a letter can give just its posted date (the desk keeps it as that day, 12:00)
      const postedOn = date(x.letter_posted_on, `${xw}.letter_posted_on`);
      const sentAt = time(x.sent_at, `${xw}.sent_at`, (status === "sent" || status === "posted") && !postedOn) ?? (postedOn ? `${postedOn}T12:00:00.000Z` : null);
      const ref = (k: string) => {
        if (!contactKeys.has(k)) problems.push(`${xw}: no contact "${k}"`);
        return k;
      };
      return {
        key: key(x.key, `${xw}.key`),
        sequence: str(x.sequence, `${xw}.sequence`, 120, true) ?? "",
        channel,
        kind: pick(x.kind, TOUCH_KINDS, `${xw}.kind`, "first"),
        step: typeof x.step === "number" && x.step >= 0 && x.step <= 2 ? x.step : null,
        status,
        sent_at: sentAt,
        letter_posted_on: postedOn,
        subject: str(x.subject, `${xw}.subject`, 500),
        version: str(x.version, `${xw}.version`, 40),
        attachment: str(x.attachment, `${xw}.attachment`, 500),
        file_ref: str(x.file_ref, `${xw}.file_ref`, 1000),
        body_text: str(x.body_text, `${xw}.body_text`, 200_000),
        counts_in_stats: x.counts_in_stats !== false,
        signed_by: x.signed_by === "kira" ? "kira" : x.signed_by === "albert" ? "albert" : null,
        note: str(x.note, `${xw}.note`, 4000),
        to: strings(x.to).map(ref),
        cc: strings(x.cc).map(ref),
        bounced: strings(x.bounced).map(ref),
        bounce_code: str(x.bounce_code, `${xw}.bounce_code`, 40),
      };
    });
    const touchKeys = new Set(touches.map((x) => x.key));
    for (const x of touches) if (x.sequence && !touchKeys.has(x.sequence)) problems.push(`${w}: touch "${x.key}" names a sequence "${x.sequence}" that isn't a touch`);
    const outcomes: ImportOutcome[] = list(t.outcomes).map((oRaw, oi) => {
      const o = obj(oRaw);
      const ow = `${w}.outcomes[${oi}]`;
      const touch = str(o.touch, `${ow}.touch`, 120);
      if (touch && !touchKeys.has(touch)) problems.push(`${ow}: no touch "${touch}"`);
      const contact = str(o.contact, `${ow}.contact`, 120);
      if (contact && !contactKeys.has(contact)) problems.push(`${ow}: no contact "${contact}"`);
      return {
        key: key(o.key, `${ow}.key`),
        touch,
        contact,
        kind: pick(o.kind, OUTCOME_KINDS, `${ow}.kind`, "reply"),
        channel: pick(o.channel, OUTCOME_CHANNELS, `${ow}.channel`, "email"),
        sentiment: o.sentiment === undefined || o.sentiment === null ? null : pick(o.sentiment, SENTIMENTS, `${ow}.sentiment`),
        received_at: time(o.received_at, `${ow}.received_at`, true) ?? "",
        subject: str(o.subject, `${ow}.subject`, 500),
        body_text: str(o.body_text, `${ow}.body_text`, 200_000),
        summary: str(o.summary, `${ow}.summary`, 4000),
        bounce_code: str(o.bounce_code, `${ow}.bounce_code`, 40),
      };
    });
    const notesList: ImportNote[] = list(t.notes_list).map((nRaw, ni) => {
      const n = obj(nRaw);
      const nw = `${w}.notes_list[${ni}]`;
      return {
        key: key(n.key, `${nw}.key`),
        kind: pick(n.kind, NOTE_KINDS, `${nw}.kind`, "note"),
        happened_at: time(n.happened_at, `${nw}.happened_at`, true) ?? "",
        title: str(n.title, `${nw}.title`, 300),
        body: str(n.body, `${nw}.body`, 200_000, true) ?? "",
      };
    });
    const actions: ImportAction[] = list(t.actions).map((aRaw, ai) => {
      const a = obj(aRaw);
      const aw = `${w}.actions[${ai}]`;
      return {
        key: key(a.key, `${aw}.key`),
        kind: pick(a.kind, ACTION_KINDS, `${aw}.kind`, "task"),
        title: str(a.title, `${aw}.title`, 300, true) ?? "",
        due_on: date(a.due_on, `${aw}.due_on`),
        starts_at: time(a.starts_at, `${aw}.starts_at`),
        status: a.status === "done" ? "done" : "open",
      };
    });
    return {
      key: key(t.key, `${w}.key`),
      name: str(t.name, `${w}.name`, 200, true) ?? "",
      group_name: str(t.group_name, `${w}.group_name`, 200),
      category: pick(t.category, CATEGORIES, `${w}.category`, "other"),
      domains: strings(t.domains).map((d) => d.toLowerCase().trim()).filter(Boolean),
      website: str(t.website, `${w}.website`, 500),
      postal_address: str(t.postal_address, `${w}.postal_address`, 1000),
      ask: pick(t.ask, ASKS, `${w}.ask`, "discount"),
      ask_detail: str(t.ask_detail, `${w}.ask_detail`),
      ask_line: str(t.ask_line, `${w}.ask_line`, 300),
      exclusivity: pick(t.exclusivity, EXCLUSIVITY, `${w}.exclusivity`, "none"),
      exclusivity_category: str(t.exclusivity_category, `${w}.exclusivity_category`, 200),
      signed_by: pick(t.signed_by, SIGNERS, `${w}.signed_by`, "albert"),
      stage: pick(t.stage, STAGES, `${w}.stage`, "researching"),
      next_call_at: time(t.next_call_at, `${w}.next_call_at`),
      hook: str(t.hook, `${w}.hook`),
      avoid: str(t.avoid, `${w}.avoid`),
      notes: str(t.notes, `${w}.notes`, 200_000),
      do_not_follow_up: t.do_not_follow_up === true,
      contacts,
      touches,
      outcomes,
      notes_list: notesList,
      actions,
    };
  });
  return problems.length ? { ok: false, problems } : { ok: true, data: { targets } };
}
