import "server-only";

// The one door from the message service to lib/emails (owned by the emails
// agent). lib/server/messages calls these, never lib/emails directly, so the
// integration step has one file to look at.
//
// While a lib/emails renderer is not built yet (it throws "... is not built
// yet"), a plain stand-in is rendered instead so every send path can be
// proved end to end on the local stack. Once the renderers exist the stand-in
// is never reached; any other renderer error still fails the send (it is
// logged in message_log as failed, never sent half-made).

import { renderEmail as libRenderEmail, renderText as libRenderText } from "@/lib/emails";
import type { EmailData, EmailName, RenderedEmail, TextData, TextName } from "@/lib/emails";

export type { EmailData, EmailName, RenderedEmail, TextData, TextName };

const NOT_BUILT = /is not built yet/;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [`${prefix}: ${String(value)}`];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
}

function standIn(name: string, data: unknown): RenderedEmail & { standIn: true } {
  const lines = flatten(data);
  const text = [`Club Yuppie (${name})`, "", ...lines].join("\n");
  return {
    standIn: true,
    subject: `Club Yuppie: ${name}`,
    preheader: name,
    html: `<p>Club Yuppie (${escapeHtml(name)})</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`,
    text,
  };
}

export function renderEmailMessage<N extends EmailName>(name: N, data: EmailData[N]): RenderedEmail & { standIn?: true } {
  try {
    return libRenderEmail(name, data);
  } catch (err) {
    if (err instanceof Error && NOT_BUILT.test(err.message)) return standIn(name, data);
    throw err;
  }
}

export function renderTextMessage<N extends TextName>(name: N, data: TextData[N]): string {
  try {
    return libRenderText(name, data);
  } catch (err) {
    if (err instanceof Error && NOT_BUILT.test(err.message)) {
      // The approved welcome text (r2c Texts, C-D4 A), so the stand-in is the real words.
      if (name === "welcome") return "Club Yuppie: You’re in. Log in: clubyuppie.com/member-login";
      return `Club Yuppie: ${name}`;
    }
    throw err;
  }
}

// Club alerts the emails module has no design for yet (a failed refund, a paid
// booking that could not be recorded). Plain words, sentence case, to the
// admin inbox only. To be replaced by an admin-booking-review reason when
// lib/emails has one.
export function renderAdminAlert(input: { subject: string; heading: string; lines: string[] }): RenderedEmail {
  const text = [input.heading, "", ...input.lines, "", "Club Yuppie: Your social life, sorted.", "This goes to the admin address."].join("\n");
  const html = [
    `<p style="font:700 20px/1.3 Arial,sans-serif;color:#1B1512">${escapeHtml(input.heading)}</p>`,
    ...input.lines.map((l) => `<p style="font:16px/1.5 Arial,sans-serif;color:#1B1512;margin:0 0 8px">${escapeHtml(l)}</p>`),
    `<p style="font:13px/1.5 Arial,sans-serif;color:#57514C">This goes to the admin address.</p>`,
  ].join("");
  return { subject: input.subject, preheader: input.heading, html, text };
}
