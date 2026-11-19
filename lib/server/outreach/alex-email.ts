import "server-only";

// Alex's 06:30 email (Outreach Desk, Phase 3, 17 Nov 2026): Albert's day on the desk, from "Alex at Yuppie"
// <alex@clubyuppie.com> to albert@clubyuppie.com and nobody else. pg_cron calls /api/cron/desk-agenda at 05:30 and
// 06:30 UTC (release/schedule-desk-agenda.sql); it sends only in the run that is 06:xx in the UK (05:30 UTC in
// summer, 06:30 UTC in winter) and only once a day (desk_agenda_runs). Through Resend, like the club's other emails.
// It reads the desk and sends this one email; it changes nothing on the desk. desk_agenda_runs keeps numbers only.

import { siteUrl } from "@/lib/emails/config";
import type { ServiceDb } from "@/lib/server/db";
import { buildAgenda, type Agenda } from "./agenda";
import { UK_TIME_ZONE, ukDate } from "./rules";

/** The only address this email ever goes to. */
export const AGENDA_TO = "albert@clubyuppie.com";
export const AGENDA_FROM = "Alex at Yuppie <alex@clubyuppie.com>";

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });

const dateWords = (ymd: string) => dayFmt.format(new Date(`${ymd}T12:00:00Z`)).replace(",", "");
const momentWords = (iso: string) => `${dayFmt.format(new Date(iso)).replace(",", "")} ${timeFmt.format(new Date(iso))}`;

/** The hour in the UK (0 to 23) at a moment. */
export function ukHour(now: Date): number {
  return Number(hourFmt.format(now));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

type Line = { text: string; href?: string; note?: string; warn?: boolean };
type Section = { title: string; lines: Line[] };

/** The email's sections, in words. Exported for the tests. */
export function agendaSections(a: Agenda, site: string): { subject: string; summary: string; sections: Section[]; notes: Line[] } {
  const partner = (id: string) => `${site}/admin/desk/t/${id}`;
  const sections: Section[] = [];
  if (a.calls.length) {
    sections.push({ title: "Calls and meetings", lines: a.calls.map((c) => ({ text: `${timeFmt.format(new Date(c.at))} ${c.partner}`, href: partner(c.targetId) })) });
  }
  if (a.followups.length) {
    sections.push({
      title: "Follow-ups going out",
      lines: a.followups.map((f) => {
        const late = f.late ? `, late (due ${dateWords(f.due)})` : "";
        let note: string;
        let warn = false;
        if (f.needsEmail) {
          note = "No email address for them: add one on the desk.";
          warn = true;
        } else if (f.draftError) {
          note = `The draft wasn't made: ${f.draftError}`;
          warn = true;
        } else if (f.words === "drafted") note = "The draft is ready in Outlook Drafts. Read it and send it.";
        else if (f.words === "written") note = "Words written. The draft is made at the drafter's next sync.";
        else {
          note = "No words yet: write them on the desk, or ask Alex.";
          warn = true;
        }
        return { text: `${f.partner}: ${f.what.toLowerCase()}${late}`, href: f.draftLink && f.words === "drafted" ? f.draftLink : partner(f.targetId), note, warn };
      }),
    });
  }
  if (a.replies.length) {
    sections.push({
      title: "Replies waiting for you",
      lines: a.replies.map((r) => ({
        text: `${r.partner}: ${r.from}, ${momentWords(r.receivedAt)}`,
        href: r.draftLink && r.words === "drafted" ? r.draftLink : partner(r.targetId),
        note: r.words === "drafted" ? "Alex's reply is ready in Outlook Drafts." : r.words === "written" ? "Alex has written a reply. The draft is made at the next sync." : "Not answered yet.",
      })),
    });
  }
  if (a.actions.length) {
    sections.push({
      title: "Action points",
      lines: a.actions.map((x) => ({
        text: `${x.title}${x.partner ? ` (${x.partner})` : ""}`,
        href: partner(x.targetId),
        note: x.late ? `Late: due ${dateWords(x.due)}` : x.startsAt ? `At ${timeFmt.format(new Date(x.startsAt))}` : undefined,
        warn: x.late,
      })),
    });
  }
  const notes: Line[] = [];
  if (a.toCheck) notes.push({ text: `${plural(a.toCheck, "email", "emails")} found in Outlook to confirm on Today.`, href: `${site}/admin/desk/today#review`, warn: true });
  if (a.toRate) notes.push({ text: `${plural(a.toRate, "reply", "replies")} to rate (positive, neutral or negative).`, href: `${site}/admin/desk/today` });
  if (!a.outlook) notes.push({ text: "Outlook isn't linked to the desk yet, so new emails and replies aren't picked up.", href: `${site}/admin/desk/settings#outlook`, warn: true });
  else if (!a.outlook.ok) notes.push({ text: `The last Outlook sync failed (${momentWords(a.outlook.lastSync)}).`, href: `${site}/admin/desk/settings#outlook`, warn: true });
  else if (a.outlook.stale) notes.push({ text: `Outlook last synced ${momentWords(a.outlook.lastSync)}. Is the Mac awake?`, href: `${site}/admin/desk/settings#outlook`, warn: true });
  if (a.comingUp) notes.push({ text: `${plural(a.comingUp, "more thing", "more things")} in the next five working days.`, href: `${site}/admin/desk` });
  // the other Relationship Managers' partners, in numbers (19 Nov 2026)
  for (const o of a.others ?? []) {
    const bits = [o.due ? `${o.due} due today` : null, o.late ? `${o.late} late` : null].filter(Boolean).join(", ");
    notes.push({ text: `${o.name}'s partners (${o.initials}): ${bits}.`, href: `${site}/admin/desk/today?rm=${o.initials}`, warn: o.late > 0 });
  }

  const parts = [
    a.calls.length ? plural(a.calls.length, "call", "calls") : null,
    a.followups.length ? plural(a.followups.length, "follow-up", "follow-ups") : null,
    a.replies.length ? plural(a.replies.length, "reply to answer", "replies to answer") : null,
    a.actions.length ? plural(a.actions.length, "action point", "action points") : null,
  ].filter((x): x is string => !!x);
  const day = dateWords(a.date);
  const summary = parts.length ? `${parts.join(", ")}.` : "Nothing due today. A clear desk.";
  const subject = parts.length ? `Your day, ${day}: ${parts.join(", ")}` : `Your day, ${day}: a clear desk`;
  return { subject, summary, sections, notes };
}

const INK = "#1B1512";
const DIM = "#57514C";
const RULE = "#E4DED3";
const WARN = "#8A5A00";

/** The email itself: HTML and plain text. */
export function renderAgenda(a: Agenda, site = siteUrl()): { subject: string; html: string; text: string } {
  const { subject, summary, sections, notes } = agendaSections(a, site);
  const today = `${site}/admin/desk/today`;
  const heading = longFmt.format(new Date(`${a.date}T12:00:00Z`)).replace(",", "");
  const line = (l: Line) => {
    const words = l.href ? `<a href="${esc(l.href)}" style="color:${INK};text-decoration:underline">${esc(l.text)}</a>` : esc(l.text);
    const note = l.note ? `<br><span style="font-size:14px;color:${l.warn ? WARN : DIM}">${esc(l.note)}</span>` : "";
    return `<tr><td style="padding:8px 0;border-bottom:1px solid ${RULE};font:16px/1.45 Arial,Helvetica,sans-serif;color:${INK}">${words}${note}</td></tr>`;
  };
  const html = [
    `<div style="display:none;max-height:0;overflow:hidden">${esc(summary)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4EC"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:8px"><tr><td style="padding:28px 24px">`,
    `<p style="margin:0 0 4px;font:700 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${DIM}">Outreach desk</p>`,
    `<p style="margin:0 0 12px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:${INK}">${esc(heading)}</p>`,
    `<p style="margin:0 0 20px;font:16px/1.5 Arial,Helvetica,sans-serif;color:${INK}">Morning Albert. ${esc(summary)}</p>`,
    ...sections.map(
      (s) =>
        `<p style="margin:20px 0 4px;font:700 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${DIM}">${esc(s.title)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${s.lines.map(line).join("")}</table>`,
    ),
    notes.length ? `<p style="margin:20px 0 4px;font:700 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${DIM}">Also</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${notes.map(line).join("")}</table>` : "",
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:${INK};border-radius:999px"><a href="${esc(today)}" style="display:inline-block;padding:12px 22px;font:700 15px/1 Arial,Helvetica,sans-serif;color:#FFFFFF;text-decoration:none">Open today on the desk</a></td></tr></table>`,
    `<p style="margin:20px 0 0;font:16px/1.5 Arial,Helvetica,sans-serif;color:${INK}">Alex</p>`,
    `<p style="margin:16px 0 0;font:13px/1.5 Arial,Helvetica,sans-serif;color:${DIM}">Alex is your assistant on the Outreach desk. This email goes only to you, every morning at 06:30. Nothing on the desk is ever sent without you.</p>`,
    `</td></tr></table></td></tr></table>`,
  ].join("");
  const textLine = (l: Line) => [`- ${l.text}`, l.note ? `  ${l.note}` : null, l.href ? `  ${l.href}` : null].filter(Boolean).join("\n");
  const text = [
    heading,
    "",
    `Morning Albert. ${summary}`,
    ...sections.flatMap((s) => ["", s.title.toUpperCase(), ...s.lines.map(textLine)]),
    ...(notes.length ? ["", "ALSO", ...notes.map(textLine)] : []),
    "",
    `Open today on the desk: ${today}`,
    "",
    "Alex",
    "",
    "Alex is your assistant on the Outreach desk. This email goes only to you, every morning at 06:30. Nothing on the desk is ever sent without you.",
  ].join("\n");
  return { subject, html, text };
}

async function send(rendered: { subject: string; html: string; text: string }, day: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set, so the email was not sent.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `desk-agenda-${day}` },
    body: JSON.stringify({ from: AGENDA_FROM, to: [AGENDA_TO], subject: rendered.subject, html: rendered.html, text: rendered.text }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Resend error (${response.status}): ${body.slice(0, 300)}`);
  try {
    return (JSON.parse(body) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

/**
 * The cron job: in the 06:00 to 06:59 UK hour, once a day, sends Albert's day. At any other hour, or when today's
 * has gone, it does nothing. Before the Phase 3 migration (no desk_agenda_runs) it does nothing either.
 */
export async function runDeskAgenda(db: ServiceDb, now: Date = new Date()) {
  const hour = ukHour(now);
  const day = ukDate(now);
  if (hour !== 6) return { sent: false, reason: `not 06:xx in the UK (it's ${String(hour).padStart(2, "0")}:xx)` };
  // claim the day first, so two runs can never both send
  const { error: claimError } = await db.from("desk_agenda_runs").insert({ day, sent_at: now.toISOString() });
  if (claimError) {
    if (claimError.code === "23505") return { sent: false, reason: "already sent today" };
    throw new Error(`desk_agenda_runs: ${claimError.message}`);
  }
  try {
    // Albert's own partners (Relationship Manager AC, or none), and a line for each other RM
    const { data: owner } = await db.from("admin_users").select("id").eq("is_owner", true).maybeSingle();
    const agenda = await buildAgenda(db, now, (owner?.id as string | undefined) ?? null);
    const providerId = await send(renderAgenda(agenda), day);
    const counts = {
      calls: agenda.calls.length,
      followups: agenda.followups.length,
      drafts_ready: agenda.followups.filter((f) => f.words === "drafted").length,
      replies: agenda.replies.length,
      actions: agenda.actions.length,
      to_check: agenda.toCheck,
    };
    await db.from("desk_agenda_runs").update({ provider_id: providerId, counts }).eq("day", day);
    return { sent: true, day, counts };
  } catch (err) {
    // let a later run (or a manual one) try again today
    await db.from("desk_agenda_runs").delete().eq("day", day);
    throw err;
  }
}
