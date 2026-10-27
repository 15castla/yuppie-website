// Text versus html in an email. Every value is text and is escaped where it
// is written; only the shell's own markup is html (an Html value). This is a
// port of Raw, esc, nb and plain in rebrand/v4/pages_r2c.py, so the output
// matches the send-ready files byte for byte (checked by
// tests/e2e/phase-a/emails/check-emails.mjs).

/** Markup the shell wrote itself. Anything that is not an Html is escaped. */
export type Html = { readonly html: string; readonly text: string };

/** A value that goes into the email: text (escaped) or shell markup. */
export type Inline = string | Html;

export const NBSP = " ";

/** Html with its plain-text twin (what the text part shows for it). */
export function html(markup: string, text: string): Html {
  return { html: markup, text };
}

export function isHtml(value: Inline): value is Html {
  return typeof value !== "string";
}

/** Escape for element content. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape for an attribute value in double quotes. */
export function escapeAttr(value: string): string {
  return escapeText(value);
}

const DATE_RE =
  /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;

/** Keep a date on one line ("Mon 9 Nov" never breaks after the 9). The text part turns these back into spaces. */
export function keepDatesTogether(value: string): string {
  return value.replace(DATE_RE, (_m, weekday: string | undefined, day: string, month: string) =>
    `${weekday ? weekday.replace(" ", NBSP) : ""}${day}${NBSP}${month}`,
  );
}

/** An Inline as html: text is escaped and its dates kept together; Html is used as it is. */
export function esc(value: Inline): string {
  return isHtml(value) ? value.html : keepDatesTogether(escapeText(value));
}

/** An Inline as the words the plain-text part shows. */
export function plain(value: Inline): string {
  const text = isHtml(value) ? value.text : value;
  return text.replace(/ /g, " ").trim();
}

/** A bold underlined link inside a sentence (pages_r2c.py link()). */
export function inlineLink(text: string, url: string, ink: string): Html {
  return html(
    `<a href="${escapeAttr(url)}" class="keep" style="color:${ink};font-weight:700;text-decoration:underline;">${escapeText(text)}</a>`,
    text,
  );
}

/** Join Inlines into one Html (text parts escaped). */
export function join(...parts: Inline[]): Html {
  return html(parts.map(esc).join(""), parts.map((p) => (isHtml(p) ? p.text : p)).join(""));
}
