import "server-only";

// Imports the desk import file (lib/server/outreach/import-format.ts): the copy from Outreach_Log (17 Nov 2026).
// A partner whose key is already in the desk is skipped whole, so a second import of the same file changes nothing.
// Each partner's history is replayed in time order through the same follow-up engine the forms use, so follow-ups,
// pauses after bounces and replies come out exactly as if each had been logged on the day.

import { randomUUID } from "node:crypto";

import type { ServiceDb } from "@/lib/server/db";
import { afterBounce, afterOutreachTouch, afterReply, nextStep, setStage, stopFollowups } from "./desk";
import type { ImportFile } from "./import-format";
import { OUTREACH_KINDS, type Stage, type TouchKind } from "./model";

export { parseImport } from "./import-format";

export type ImportResult = { targets: number; skipped: number; contacts: number; touches: number; outcomes: number; notes: number; actions: number };

async function must<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) throw new Error(`Import: ${what}: ${error.message}`);
  return data as NonNullable<T>;
}

// Partners go in a few at a time, each partner's own history still in order: one at a time took a while on the live
// site, where every step is a round trip to the database (Albert, 16 Nov 2026: "fairly delayed"). The only thing one
// partner reads of another is how many January emails each day already has (januaryDay), so two partners imported
// side by side may land on the same January day; it is a spread, not a rule.
const AT_ONCE = 4;

export async function importDesk(db: ServiceDb, file: ImportFile, rm: string | null = null): Promise<ImportResult> {
  const result: ImportResult = { targets: 0, skipped: 0, contacts: 0, touches: 0, outcomes: 0, notes: 0, actions: 0 };
  let next = 0;
  const worker = async () => {
    while (next < file.targets.length) await importTarget(db, file.targets[next++], result, rm);
  };
  const runs = await Promise.allSettled(Array.from({ length: Math.min(AT_ONCE, file.targets.length) }, worker));
  const failed = runs.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
  return result;
}

async function importTarget(db: ServiceDb, t: ImportFile["targets"][number], result: ImportResult, rm: string | null): Promise<void> {
  const { data: already } = await db.from("outreach_targets").select("id").eq("import_key", t.key).maybeSingle();
  if (already) {
    result.skipped += 1;
    return;
  }
  const target = await must(
    db
      .from("outreach_targets")
      .insert({
        name: t.name,
        group_name: t.group_name,
        category: t.category,
        domains: t.domains,
        website: t.website,
        postal_address: t.postal_address,
        ask: t.ask,
        ask_detail: t.ask_detail,
        ask_line: t.ask_line,
        exclusivity: t.exclusivity,
        exclusivity_category: t.exclusivity_category,
        signed_by: t.signed_by,
        // the Relationship Manager: whoever imports the file (19 Nov 2026)
        ...(rm ? { rm } : {}),
        stage: "not_started",
        hook: t.hook,
        avoid: t.avoid,
        notes: t.notes,
        do_not_follow_up: t.do_not_follow_up,
        import_key: t.key,
      })
      .select("id, stage, do_not_follow_up, opted_out")
      .single(),
    `partner ${t.key}`,
  );
  result.targets += 1;

  const contactIds = new Map<string, string>();
  const contactEmails = new Map<string, string | null>();
  // contacts, notes and actions go in one request each
  const contactRows = t.contacts.map((c) => {
    const id = randomUUID();
    contactIds.set(c.key, id);
    contactEmails.set(c.key, c.email);
    return {
      id,
      target_id: target.id,
      name: c.name,
      role: c.role,
      mailbox_type: c.mailbox_type,
      email: c.email,
      email_source: c.email_source,
      source_note: c.source_note,
      email_status: c.email_status,
      linkedin_url: c.linkedin_url,
      is_primary: c.is_primary,
      import_key: c.key,
    };
  });
  if (contactRows.length) await must(db.from("outreach_contacts").insert(contactRows), `contacts of ${t.key}`);
  result.contacts += contactRows.length;

  const touchIds = new Map<string, string>(t.touches.map((x) => [x.key, randomUUID()]));
  const sequenceOf = new Map<string, string>(t.touches.map((x) => [x.key, touchIds.get(x.sequence) ?? touchIds.get(x.key)!]));

  // replay everything in time order: touches (with their bounces just after) and outcomes
  type Event = { at: string; order: number; run: () => Promise<void> };
  const events: Event[] = [];
  const fresh = async () => must(db.from("outreach_targets").select("id, stage, do_not_follow_up, opted_out").eq("id", target.id).single(), "partner");

  t.touches.forEach((x, i) => {
    const id = touchIds.get(x.key)!;
    const sequenceId = sequenceOf.get(x.key)!;
    const at = x.sent_at ?? (x.letter_posted_on ? `${x.letter_posted_on}T12:00:00.000Z` : "9999-12-31T00:00:00.000Z");
    events.push({
      at,
      order: i,
      run: async () => {
        const step = x.kind === "first" ? 0 : x.kind === "follow_up" ? (x.step ?? (await nextStep(db, sequenceId))) : x.step;
        await must(
          db.from("outreach_touches").insert({
            id,
            target_id: target.id,
            sequence_id: sequenceId,
            channel: x.channel,
            kind: x.kind,
            step,
            status: x.status,
            subject: x.subject,
            version: x.version,
            attachment: x.attachment,
            file_ref: x.file_ref,
            body_text: x.body_text,
            sent_at: x.sent_at ?? (x.letter_posted_on ? `${x.letter_posted_on}T12:00:00.000Z` : null),
            letter_posted_on: x.letter_posted_on,
            letter_class: x.channel === "letter" ? "first" : null,
            counts_in_stats: x.counts_in_stats,
            signed_by: x.signed_by ?? t.signed_by,
            note: x.note,
            created_by: "import",
            import_key: x.key,
          }),
          `touch ${x.key}`,
        );
        const recipients = [
          ...x.to.map((k) => ({ touch_id: id, contact_id: contactIds.get(k) ?? null, address: contactEmails.get(k) ?? null, role: "to" })),
          ...x.cc.map((k) => ({ touch_id: id, contact_id: contactIds.get(k) ?? null, address: contactEmails.get(k) ?? null, role: "cc" })),
        ];
        if (recipients.length) await must(db.from("outreach_touch_recipients").insert(recipients), `recipients of ${x.key}`);
        result.touches += 1;
        const sent = x.status === "sent" || x.status === "posted";
        if (sent && OUTREACH_KINDS.includes(x.kind as TouchKind)) {
          await afterOutreachTouch(db, { id, target_id: target.id, sequence_id: sequenceId, channel: x.channel, kind: x.kind, step, sent_at: x.sent_at ?? `${x.letter_posted_on}T12:00:00.000Z` }, await fresh(), "import");
        }
        for (const k of x.bounced) {
          await afterBounce(db, target.id, sequenceId, contactEmails.get(k) ?? null, x.bounce_code, x.sent_at ?? new Date().toISOString());
        }
      },
    });
  });

  t.outcomes.forEach((o, i) => {
    events.push({
      at: o.received_at,
      order: 10_000 + i,
      run: async () => {
        const id = randomUUID();
        const touchId = o.touch ? (touchIds.get(o.touch) ?? null) : null;
        const sequenceId = o.touch ? (sequenceOf.get(o.touch) ?? null) : null;
        const contactId = o.contact ? (contactIds.get(o.contact) ?? null) : null;
        const contact = o.contact ? t.contacts.find((c) => c.key === o.contact) : undefined;
        await must(
          db.from("outreach_outcomes").insert({
            id,
            target_id: target.id,
            sequence_id: sequenceId,
            touch_id: touchId,
            contact_id: contactId,
            kind: o.kind,
            channel: o.channel,
            sentiment: o.sentiment,
            received_at: o.received_at,
            from_address: contact?.email ?? null,
            from_name: contact?.name ?? null,
            subject: o.subject,
            body_text: o.body_text,
            summary: o.summary,
            bounced_address: o.kind === "bounce" ? (contact?.email ?? null) : null,
            bounce_code: o.bounce_code,
            match_method: "manual",
            confirmed: true,
            created_by: "import",
            import_key: o.key,
          }),
          `outcome ${o.key}`,
        );
        result.outcomes += 1;
        if (o.kind === "reply") await afterReply(db, { id, target_id: target.id, sequence_id: sequenceId, touch_id: touchId, received_at: o.received_at }, await fresh(), "import");
        if (o.kind === "bounce") await afterBounce(db, target.id, sequenceId, contact?.email ?? null, o.bounce_code, o.received_at);
        if (o.kind === "opt_out_request") {
          if (contactId) await db.from("outreach_contacts").update({ opted_out: true, opted_out_at: o.received_at }).eq("id", contactId);
          await stopFollowups(db, target.id, "opted_out");
        }
      },
    });
  });

  events.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);
  for (const e of events) await e.run();

  const noteRows = t.notes_list.map((n) => ({ target_id: target.id, kind: n.kind, happened_at: n.happened_at, title: n.title, body: n.body, source: "import", import_key: n.key }));
  if (noteRows.length) await must(db.from("outreach_notes").insert(noteRows), `notes of ${t.key}`);
  result.notes += noteRows.length;
  const actionRows = t.actions.map((a) => ({
    target_id: target.id,
    kind: a.kind,
    title: a.title,
    due_on: a.due_on,
    starts_at: a.starts_at,
    status: a.status,
    done_at: a.status === "done" ? new Date().toISOString() : null,
    source: "import",
    import_key: a.key,
  }));
  if (actionRows.length) await must(db.from("outreach_actions").insert(actionRows), `actions of ${t.key}`);
  result.actions += actionRows.length;

  // the stage the log says, as of the partner's latest event, and the next call
  const latest = [...events.map((e) => e.at), ...t.notes_list.map((n) => n.happened_at)].filter((a) => a < "9999").sort().pop();
  await setStage(db, await fresh(), t.stage as Stage, "import", null, latest ?? new Date().toISOString());
  if (t.next_call_at) await db.from("outreach_targets").update({ next_call_at: t.next_call_at }).eq("id", target.id);
}
