// The one email shell (r2c "The shell"): yellow header band with the
// wordmark, eyebrow, big headline with a serif phrase, intro, a pale card
// with a hard shadow, one black button, a second link, small print, a
// drawing standing on a 3px rule when the news is good, and the footer with
// the company line. Tables, inline styles, a ghost table for Outlook, a VML
// button, designed dark mode (C-D1) and a plain-text part.
//
// A line-for-line port of render() and plain_text() in
// rebrand/v4/pages_r2c.py (template mode, the files a developer lifts). Do
// not restyle here: tests/e2e/phase-a/emails/check-emails.mjs renders the
// design's example content and compares it with out/r2c-send-*.html|.txt.

import {
  COMPANY_LINE,
  EMAIL_COLOR_SCHEME,
  EMAIL_IMAGES,
  NOTIFICATIONS_PATH,
  SUPPORT_EMAIL,
  absoluteUrl,
  imageUrl,
  mapsUrl,
  normaliseSite,
  notificationsLinkOn,
  siteUrl,
  type EmailArt,
  type EmailColorScheme,
} from "./config";
import { esc, escapeAttr, escapeText, html, plain, type Html, type Inline } from "./escape";
import type { EmailPlace, RenderedEmail } from "./types";

const INK = "#1B1512";
const YEL = "#FFD904";
const CREAM = "#F5F3E7";
const PALE = "#FFF3B0";
const MUTED = "#57514C";
const A = "font-family:'Almarai',Arial,Helvetica,sans-serif;";
const SERIF =
  "font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;letter-spacing:-.01em;";
const SWITCH_LABEL = "Choose what we email you";
const FONTS_LINK =
  "https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Instrument+Serif:ital@0;1&display=swap";

// ---------------------------------------------------------------- what a message is

export type CardRow = {
  label: string;
  value: Inline;
  /** A map link for the plain-text part ("Map: …"). */
  map?: string;
};

export type Block =
  | { kind: "card"; rows: CardRow[]; total?: { label: string; value: string } }
  | { kind: "code"; code: Inline; rows?: { label: string; value: Inline }[] };

export type EmailSpec = {
  subject: string;
  /** The preheader (the inbox preview line). */
  pre: Inline;
  /** The eyebrow, in sentence case (capitals come from the style). */
  label: string;
  /** The headline: plain part, serif part (empty: none), and whether the serif part is on its own line. */
  h1: { a: Inline; b: Inline; br: boolean };
  intro: Inline[];
  blocks?: Block[];
  /** The one black button: label and absolute URL. */
  button?: { label: string; url: string };
  /** Second links ("Add to calendar"), each 44px tall. */
  links2?: { label: string; url: string }[];
  /** The small print. */
  below?: Inline;
  /** Small print at 15/22 instead of 13/19 (the code emails). */
  belowBig?: boolean;
  /** A drawing on a 3px rule, for good news. */
  art?: EmailArt;
  /** "admin": no questions line, privacy link or company line. */
  foot: "member" | "applicant" | "admin";
  /** "You’re getting this because …". */
  why: Inline;
  /** "We always send booking emails." */
  always?: string;
  /** The "Choose what we email you" link (drawn only while the Notifications page is on). */
  switchLink?: boolean;
  /** The switch link's words. Default "Choose what we email you"; the chat nudge says "Turn these emails off" (round 3). */
  switchLabel?: string;
  /** In the plain-text part, the switch link on its own line instead of after the reason (the chat nudge, round 3). */
  switchOwnLine?: boolean;
  /** Default "Questions?". */
  q?: string;
};

export type RenderOptions = {
  /** The site for links and images. Default: NEXT_PUBLIC_SITE_URL, else https://clubyuppie.com. */
  site?: string;
  /** Default EMAIL_COLOR_SCHEME. */
  scheme?: EmailColorScheme;
  /** Draw "Choose what we email you". Default: the Notifications flag. */
  notificationsLink?: boolean;
  /**
   * False when the sender strips HTML comments. Supabase Auth does (checked on
   * v2.177.0: Go's html/template removes every comment), which removes the
   * Outlook conditional comments and with them the VML button, so the html
   * button must not hide itself from Outlook (no mso-hide:all). Default true.
   */
  commentsSurvive?: boolean;
};

export type ResolvedOptions = { site: string; scheme: EmailColorScheme; notificationsLink: boolean; commentsSurvive: boolean };

export function resolveOptions(options: RenderOptions = {}): ResolvedOptions {
  return {
    site: normaliseSite(options.site ?? siteUrl()),
    scheme: options.scheme ?? EMAIL_COLOR_SCHEME,
    notificationsLink: options.notificationsLink ?? notificationsLinkOn(),
    commentsSurvive: options.commentsSurvive ?? true,
  };
}

// ---------------------------------------------------------------- the Where value

// A UK postcode stays on one line ("AB1 2CD").
const POSTCODE = "\\b[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}\\b";

/**
 * Address lines: the venue, then the address, split on its new lines when it
 * has any ("Unit 14, The Courtyard" stays one line), else on its commas. The
 * venue is not repeated when the address starts with it.
 */
export function placeLines(place: EmailPlace): string[] {
  const venue = place.venue.trim();
  const address = (place.address ?? "").trim();
  const rest = address
    .split(/\r?\n/.test(address) ? /\r?\n/ : /,/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rest.length > 0 && rest[0].toLowerCase() === venue.toLowerCase()) rest.shift();
  return [venue, ...rest].filter(Boolean);
}

/** The Where value (lines, then "Open in Maps") and its map link, as pages_r2c.py maps(). */
export function whereValue(place: EmailPlace): { value: Html; map: string; text: string } {
  const lines = placeLines(place);
  const text = lines.join(", ");
  const map = mapsUrl(text);
  const linesHtml = lines
    .map((line) => {
      return new RegExp(POSTCODE, "i").test(line)
        ? escapeText(line).replace(new RegExp(POSTCODE, "gi"), (pc) => `<span style="white-space:nowrap;">${pc}</span>`)
        : esc(line);
    })
    .join("<br>");
  const markup =
    `${linesHtml}<br><a href="${escapeAttr(map)}" class="keepc" style="display:inline-block;padding:11px 0;margin:-5px 0 -11px 0;font-size:15px;line-height:22px;font-weight:700;color:${INK};text-decoration:underline;">Open in Maps</a>`;
  return { value: html(markup, text), map, text };
}

// ---------------------------------------------------------------- pieces

function spacer(h: number): string {
  return `<div style="height:${h}px;line-height:${h}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</div>`;
}

function label(t: string): string {
  return `<span class="t-clabel" style="${A}font-size:13px;line-height:22px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};">${esc(t)}</span>`;
}

function kv(l: string, value: Inline, first: boolean, last: boolean, w = 84, firstPad = "0"): string {
  const bt = first ? "" : `border-top:1.5px solid ${INK};`;
  const pt = first ? firstPad : "12px";
  const pb = last ? "0" : "12px";
  return (
    `<tr><td valign="top" width="${w}" class="kv-l${first && firstPad === "0" ? " kv-first" : ""}" style="${bt}padding:${pt} 12px ${pb} 0;width:${w}px;">${label(l)}</td>` +
    `<td valign="top" class="t-card kv-v${last ? " kv-last" : ""}" style="${bt}padding:${pt} 0 ${pb} 0;${A}font-size:17px;line-height:22px;font-weight:700;color:${INK};word-break:break-word;">${esc(value)}</td></tr>`
  );
}

function total(l: string, value: string): string {
  return (
    `<tr><td colspan="2" style="border-top:3px solid ${INK};padding:14px 0 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>` +
    `<td valign="middle" class="t-card" style="${A}font-size:17px;line-height:26px;font-weight:800;color:${INK};">${esc(l)}</td>` +
    `<td valign="middle" align="right" class="t-card" style="${A}font-size:32px;line-height:32px;font-weight:800;letter-spacing:-.02em;color:${INK};">${esc(value)}</td></tr></table></td></tr>`
  );
}

function cardShell(inner: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;"><tr>` +
    `<td class="bg-pale" bgcolor="${PALE}" style="background-color:${PALE};border:2px solid ${INK};border-radius:20px;box-shadow:6px 6px 0 ${INK};padding:22px 20px;">${inner}</td></tr></table>`
  );
}

function cardHtml(rows: CardRow[], tot?: { label: string; value: string }): string {
  let body = rows.map((r, i) => kv(r.label, r.value, i === 0, i === rows.length - 1 && !tot)).join("");
  if (tot) body += total(tot.label, tot.value);
  return cardShell(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${body}</table>`);
}

function codeHtml(code: Inline, rows?: { label: string; value: Inline }[]): string {
  let c = `<div class="code t-card" style="${A}font-size:40px;line-height:44px;font-weight:800;letter-spacing:.16em;text-align:center;color:${INK};padding-left:.16em;mso-line-height-rule:exactly;">${esc(code)}</div>`;
  if (rows && rows.length > 0) {
    const r = rows
      .map(({ label: l, value: v }, i) => {
        const top = i === 0 ? "padding:14px 12px 4px 0;" : "padding:0 12px 0 0;";
        const topv = i === 0 ? "padding:14px 0 4px 0;" : "padding:0;";
        return (
          `<tr><td valign="top" width="64" class="ft-l${i === 0 ? " ft-first" : ""}" style="${top}width:64px;">${label(l)}</td>` +
          `<td valign="top" class="t-card ft-v" style="${topv}${A}font-size:15px;line-height:22px;font-weight:700;color:${INK};"><span style="color:inherit;text-decoration:none;overflow-wrap:anywhere;word-break:break-word;">${esc(v)}</span></td></tr>`
        );
      })
      .join("");
    c += spacer(20) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1.5px solid ${INK};">${r}</table>`;
  }
  return cardShell(c);
}

function buttonHtml(l: string, url: string, commentsSurvive: boolean): string {
  // The VML button's width for Outlook for Windows, as the design sizes it.
  const w = Math.max(196, Math.trunc(Array.from(l).length * 10 + 64));
  const href = escapeAttr(url);
  return (
    `<table role="presentation" class="btn-wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;"><tr><td>\n` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:56px;v-text-anchor:middle;width:${w}px;" arcsize="50%" stroke="f" fillcolor="${INK}"><w:anchorlock/><center style="color:${YEL};font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;">${esc(l)}</center></v:roundrect><![endif]-->\n` +
    `<!--[if !mso]><!--><a href="${href}" class="btn bg-btn t-btn" style="display:block;box-sizing:border-box;background-color:${INK};border-radius:999px;padding:17px 28px;${A}font-size:17px;line-height:22px;font-weight:700;color:${YEL};text-align:center;text-decoration:none;${commentsSurvive ? "mso-hide:all;" : ""}">${esc(l)}</a><!--<![endif]-->\n` +
    `</td></tr></table>`
  );
}

function ghost(inner: string): string {
  return (
    `<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td>${inner}</td></tr></table>` +
    `<!--[if mso]></td></tr></table><![endif]-->`
  );
}

function band(cls: string, bg: string, inner: string, style = ""): string {
  return `<tr><td align="center" class="${cls}" bgcolor="${bg}" style="background-color:${bg};${style}">${ghost(inner)}</td></tr>`;
}

function img(file: string, w: number, h: number, alt: string, site: string, style = ""): string {
  return `<img src="${escapeAttr(imageUrl(file, site))}" width="${w}" height="${h}" alt="${escapeAttr(alt)}" style="display:block;margin:0 auto;width:${w}px;height:${h}px;border:0;${style}">`;
}

function bodyCss(scheme: EmailColorScheme): string {
  const cs = scheme === "designed" ? "light dark" : "light only";
  const base = `  :root { color-scheme: ${cs}; supported-color-schemes: ${cs}; }
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  /* stop Apple Mail, Gmail and Samsung turning plain text into blue links */
  a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; font-size:inherit !important; font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important; }
  u + #body a { color:inherit; text-decoration:none; font-size:inherit; font-family:inherit; font-weight:inherit; line-height:inherit; }
  #MessageViewBody a { color:inherit; text-decoration:none; font-size:inherit; font-family:inherit; font-weight:inherit; line-height:inherit; }
  a.keep { color:${INK} !important; text-decoration:underline !important; font-weight:700 !important; }
  a.keepc { color:${INK} !important; text-decoration:underline !important; font-weight:700 !important; }
  /* phones first (320 to 480); bigger type from 481 */
  @media only screen and (min-width:481px) {
    .h1 { font-size:46px !important; line-height:44px !important; }
    .btn-wrap { width:auto !important; }
    .btn { min-width:176px !important; }
    .code { font-size:52px !important; line-height:56px !important; }
  }
  @media only screen and (max-width:360px) {
    .code { font-size:34px !important; letter-spacing:.12em !important; }
    .h1 { font-size:32px !important; line-height:33px !important; }
    .kv-l { display:block !important; width:auto !important; padding:12px 0 2px 0 !important; }
    .kv-v { display:block !important; border-top:0 !important; padding:0 0 12px 0 !important; }
    .ft-l { display:block !important; width:auto !important; padding:10px 0 0 0 !important; }
    .ft-v { display:block !important; padding:2px 0 0 0 !important; }
    .ft-first { padding-top:14px !important; }
    .kv-first { padding-top:0 !important; }
    .kv-last { padding-bottom:0 !important; }
  }
`;
  const dark =
    scheme === "designed"
      ? `  /* DESIGNED DARK (option B). Apple Mail and iOS Mail honour this. The yellow bands (logo, drawing) stay yellow: the wordmark is never recoloured.
     Palette only: ink ground, cream and yellow type, the pale card stays pale. Muted ink on ink fails contrast (2.3 to 1), so nothing muted is used on the dark ground. */
  @media (prefers-color-scheme: dark) {
    body, .bg-page { background-color:${INK} !important; background-image:linear-gradient(${INK},${INK}) !important; }
    .bg-band { background-color:${YEL} !important; background-image:linear-gradient(${YEL},${YEL}) !important; }
    .bg-pale { background-color:${PALE} !important; border-color:${YEL} !important; box-shadow:6px 6px 0 ${YEL} !important; }
    .bg-btn { background-color:${YEL} !important; }
    .t-btn { color:${INK} !important; }
    .t-ink, .t-sub { color:${CREAM} !important; }
    .t-label, .t-accent { color:${YEL} !important; }
    .t-card { color:${INK} !important; }
    .t-clabel { color:${MUTED} !important; }
    a.keep { color:${YEL} !important; }
    a.keepc { color:${INK} !important; }
    .t-brand { color:${INK} !important; }
  }
`
      : `  /* FORCED LIGHT (option A): Apple Mail, the Gmail app and Outlook.com keep the yellow palette in dark mode. */
  @media (prefers-color-scheme: dark) {
    body, .bg-page, .bg-band { background-color:${YEL} !important; }
    .bg-pale { background-color:${PALE} !important; }
    .bg-btn { background-color:${INK} !important; }
    .t-ink, .t-card, .t-brand { color:${INK} !important; }
    .t-btn { color:${YEL} !important; }
    .t-sub, .t-label, .t-clabel { color:${MUTED} !important; }
  }
`;
  const pins = `  /* Outlook (Windows, Mac, .com) tags what it recolours with data-ogsc / data-ogsb: pin the light palette there in both schemes */
  [data-ogsc] .t-ink, [data-ogsc] .t-card, [data-ogsc] .t-brand { color:${INK} !important; }
  [data-ogsc] .t-btn { color:${YEL} !important; }
  [data-ogsc] .t-sub, [data-ogsc] .t-label, [data-ogsc] .t-clabel { color:${MUTED} !important; }
  [data-ogsc] .t-accent { color:${INK} !important; }
  [data-ogsb] .bg-page, [data-ogsb] .bg-band { background-color:${YEL} !important; }
  [data-ogsb] .bg-pale { background-color:${PALE} !important; }
  [data-ogsb] .bg-btn { background-color:${INK} !important; }
`;
  return base + dark + pins;
}

// ---------------------------------------------------------------- the renderer

type PartKind = "eyebrow" | "h1" | "intro" | "card" | "btn" | "link2" | "below";

const GAPS: Partial<Record<`${PartKind}>${PartKind}`, number>> = {
  "eyebrow>h1": 16,
  "h1>intro": 20,
  "intro>card": 24,
  "intro>btn": 32,
  "intro>below": 20,
  "card>btn": 32,
  "card>below": 24,
  "card>link2": 12,
  "btn>link2": 0,
  "btn>below": 20,
  "link2>below": 8,
  "intro>link2": 20,
};

function introHtml(ps: Inline[]): string {
  return ps
    .map(
      (p) =>
        `<p class="t-ink" style="margin:0;${A}font-size:17px;line-height:25px;font-weight:400;color:${INK};mso-line-height-rule:exactly;">${esc(p)}</p>`,
    )
    .join(spacer(12));
}

/** The html of one email. */
export function renderHtml(spec: EmailSpec, opts: ResolvedOptions): string {
  const { site, scheme } = opts;
  const h1 =
    `<h1 class="h1 t-ink" style="margin:0;${A}font-size:36px;line-height:36px;font-weight:800;letter-spacing:-.035em;word-spacing:.06em;color:${INK};mso-line-height-rule:exactly;">` +
    esc(spec.h1.a) +
    (plain(spec.h1.b) ? `${spec.h1.br ? "<br>" : " "}<span class="t-accent" style="${SERIF}">${esc(spec.h1.b)}</span>` : "") +
    "</h1>";
  const eyebrow = `<p class="t-label" style="margin:0;${A}font-size:13px;line-height:18px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};">${esc(spec.label)}</p>`;

  const parts: [PartKind, string][] = [
    ["eyebrow", eyebrow],
    ["h1", h1],
    ["intro", introHtml(spec.intro)],
  ];
  for (const blk of spec.blocks ?? []) {
    parts.push(["card", blk.kind === "card" ? cardHtml(blk.rows, blk.total) : codeHtml(blk.code, blk.rows)]);
  }
  if (spec.button) parts.push(["btn", buttonHtml(spec.button.label, spec.button.url, opts.commentsSurvive)]);
  if (spec.links2 && spec.links2.length > 0) {
    parts.push([
      "link2",
      spec.links2
        .map(
          ({ label: t, url }) =>
            `<a href="${escapeAttr(url)}" class="keep" style="display:inline-block;padding:12px 0;color:${INK};font-size:15px;line-height:20px;font-weight:700;text-decoration:underline;${A}">${esc(t)}</a>`,
        )
        .join(""),
    ]);
  }
  if (spec.below !== undefined) {
    const [size, lh] = spec.belowBig ? ["15px", "22px"] : ["13px", "19px"];
    parts.push([
      "below",
      `<p class="t-sub" style="margin:0;${A}font-size:${size};line-height:${lh};color:${MUTED};mso-line-height-rule:exactly;">${esc(spec.below)}</p>`,
    ]);
  }

  let content = "";
  parts.forEach(([kind, h], i) => {
    content += h;
    if (i < parts.length - 1) content += spacer(GAPS[`${kind}>${parts[i + 1][0]}`] ?? 24);
  });
  const lastKind = parts[parts.length - 1][0];
  // The card's 6px shadow hangs below it: keep it inside the content band, or the drawing band paints over it.
  if (spec.art && lastKind === "card") content += spacer(8);

  const why = esc(spec.why) + (spec.always ? " " + esc(spec.always) : "");
  const sw =
    spec.switchLink && opts.notificationsLink
      ? ` <a href="${escapeAttr(absoluteUrl(NOTIFICATIONS_PATH, site))}" class="keep" style="color:${INK};font-weight:700;text-decoration:underline;">${escapeText(spec.switchLabel ?? SWITCH_LABEL)}</a>.`
      : "";
  const P = (inner: string, mb: number) =>
    `<p class="t-sub" style="margin:0 0 ${mb}px;${A}font-size:13px;line-height:19px;color:${MUTED};">${inner}</p>`;
  let foot = `<p class="t-ink" style="margin:0 0 8px;${A}font-size:15px;line-height:22px;font-weight:700;color:${INK};">Club Yuppie: Your social life, sorted.</p>`;
  if (spec.foot === "admin") {
    foot += P(why + sw, 0);
  } else {
    foot += P(why + sw, 12);
    foot += P(
      `${esc(spec.q ?? "Questions?")} Email <a href="mailto:${SUPPORT_EMAIL}" class="keep" style="color:${INK};font-weight:700;text-decoration:underline;">${SUPPORT_EMAIL}</a>.<br>Read our <a href="${escapeAttr(absoluteUrl("/privacy", site))}" class="keep" style="color:${INK};font-weight:700;text-decoration:underline;">privacy policy</a>.`,
      12,
    );
    foot +=
      "\n  <!-- ===== COMPANY LINE: edit this text in ONE place only (COMPANY_LINE in the shell) ===== -->\n  " +
      P(escapeText(COMPANY_LINE), 0) +
      "\n  <!-- ===== END COMPANY LINE ===== -->";
  }

  const logo = EMAIL_IMAGES.logo;
  const header = `<div style="padding:20px 20px 18px;text-align:center;"><a href="${escapeAttr(site)}" style="text-decoration:none;color:${INK};">${img(logo.file, logo.width, logo.height, "Club Yuppie", site, `${A}font-size:18px;line-height:50px;font-weight:800;color:${INK};text-align:center;`)}</a></div>`;
  let rows = band("bg-band", YEL, header, `border-bottom:1.5px solid ${INK};`);
  const hasArt = Boolean(spec.art);
  rows += band(
    "bg-page",
    YEL,
    `<div style="padding:40px 20px ${hasArt ? 0 : 40}px;">${content}</div>`,
    hasArt ? "" : `border-bottom:3px solid ${INK};`,
  );
  if (spec.art) {
    const art = EMAIL_IMAGES[spec.art];
    rows += band(
      "bg-band",
      YEL,
      `<div style="padding:${lastKind === "card" ? 32 : 40}px 20px 0;font-size:0;line-height:0;">${img(art.file, art.width, art.height, "", site)}</div>`,
      `border-bottom:3px solid ${INK};`,
    );
  }
  rows += band("bg-page", YEL, `<div style="padding:32px 20px 40px;">\n  ${foot}\n</div>`, "");

  const cs = scheme === "designed" ? "light dark" : "light only";
  const pad = "&zwnj;&nbsp;".repeat(90);
  const hidden = "display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;";
  const out =
    `<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, address=no, email=no, url=no">
<meta name="color-scheme" content="${cs}">
<meta name="supported-color-schemes" content="${cs}">
<title>${escapeText(spec.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!-- Fonts: Almarai and Instrument Serif load where the client allows linked fonts (Apple Mail, iOS Mail). Everywhere else the stacks fall back to Arial and Georgia. -->
<link href="${FONTS_LINK}" rel="stylesheet">
<style>
${bodyCss(scheme)}</style>
</head>
<body id="body" class="bg-page" bgcolor="${YEL}" style="margin:0;padding:0;background-color:${YEL};background-image:linear-gradient(${YEL},${YEL});">
` +
    `<div style="${hidden}">${esc(spec.pre)}</div><div style="${hidden}">${pad}</div>\n` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-page" bgcolor="${YEL}" style="width:100%;background-color:${YEL};">\n${rows}\n</table>\n` +
    "</body>\n</html>\n";
  return out.replace(/ /g, "&nbsp;");
}

/** The plain-text part: the same words, no styling (pages_r2c.py plain_text()). */
export function renderPlain(spec: EmailSpec, opts: ResolvedOptions): string {
  const out: string[] = [];
  out.push([plain(spec.h1.a), plain(spec.h1.b)].filter(Boolean).join(" "), "");
  for (const p of spec.intro) out.push(plain(p), "");
  for (const blk of spec.blocks ?? []) {
    if (blk.kind === "card") {
      for (const r of blk.rows) {
        out.push(`${r.label}: ${plain(r.value)}`);
        if (r.map) out.push(`Map: ${r.map}`);
      }
      if (blk.total) out.push(`${blk.total.label}: ${blk.total.value}`);
      out.push("");
    } else {
      out.push(plain(blk.code));
      if (blk.rows && blk.rows.length > 0) {
        out.push("");
        for (const r of blk.rows) out.push(`${r.label}: ${plain(r.value)}`);
      }
      out.push("");
    }
  }
  if (spec.button) out.push(`${spec.button.label}: ${spec.button.url}`, "");
  if (spec.links2 && spec.links2.length > 0) {
    for (const l of spec.links2) out.push(`${l.label}: ${l.url}`);
    out.push("");
  }
  if (spec.below !== undefined) out.push(plain(spec.below), "");
  out.push("Club Yuppie: Your social life, sorted.");
  let why = plain(spec.why);
  if (spec.always) why += " " + spec.always;
  const sw = `${spec.switchLabel ?? SWITCH_LABEL}: ${absoluteUrl(NOTIFICATIONS_PATH, opts.site)}`;
  const swOn = spec.switchLink && opts.notificationsLink;
  if (swOn && !spec.switchOwnLine) why += ` ${sw}`;
  out.push(why);
  if (swOn && spec.switchOwnLine) out.push(sw);
  if (spec.foot !== "admin") {
    out.push(`${spec.q ?? "Questions?"} Email ${SUPPORT_EMAIL}.`);
    out.push(`Read our privacy policy: ${absoluteUrl("/privacy", opts.site)}`);
    out.push("", COMPANY_LINE);
  }
  return out.join("\n").replace(/\s+$/, "") + "\n";
}

export function renderSpec(spec: EmailSpec, options: RenderOptions = {}): RenderedEmail {
  const opts = resolveOptions(options);
  return {
    subject: spec.subject,
    preheader: plain(spec.pre),
    html: renderHtml(spec, opts),
    text: renderPlain(spec, opts),
  };
}
