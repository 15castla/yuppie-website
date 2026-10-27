// What the email preview can draw: every email with its example fixtures,
// the three Supabase Auth templates with sample placeholder values, and the
// texts. Dev preview only (a 404 unless MEMBERS_PREVIEW=1).

import { EMAIL_NAMES, renderEmailWith, type EmailData, type EmailName, type RenderedEmail } from "@/lib/emails";
import { EMAIL_FIXTURES } from "@/lib/emails/fixtures";
import { renderSupabaseTemplate, SUPABASE_TEMPLATE_NAMES, type SupabaseTemplateName } from "@/lib/emails/supabase";

export const AUTH_PREFIX = "auth-";

/** Sample values for the Supabase placeholders (EXAMPLE DATA). */
export function fillAuthPlaceholders(htmlOrText: string, site: string): string {
  return htmlOrText
    .replaceAll("{{ .Token }}", "482913")
    .replaceAll("{{ .Email }}", "sam@example.com")
    .replaceAll("{{ .NewEmail }}", "sam.new@example.com")
    .replaceAll("{{ .SiteURL }}", site)
    .replaceAll("{{ .TokenHash }}", "d41d8cd9");
}

export type PreviewEntry = {
  /** The URL name: an EmailName, or auth-<template>. */
  name: string;
  title: string;
  fixtures: { id: string; label: string }[];
};

export const AUTH_TITLES: Record<SupabaseTemplateName, string> = {
  magic_link: "Supabase: login code (Magic Link)",
  email_change: "Supabase: email change code",
  recovery: "Supabase: admin password reset",
};

export function previewEntries(): PreviewEntry[] {
  return [
    ...EMAIL_NAMES.map((name) => ({
      name,
      title: name,
      fixtures: EMAIL_FIXTURES[name].map(({ id, label }) => ({ id, label })),
    })),
    ...SUPABASE_TEMPLATE_NAMES.map((t) => ({
      name: AUTH_PREFIX + t,
      title: AUTH_TITLES[t],
      fixtures: [{ id: "design", label: "Sample code and addresses" }],
    })),
  ];
}

/** Render one preview email, with images and links on `site` (the dev server). null when unknown. */
export function renderPreview(name: string, fixtureId: string | undefined, site: string): RenderedEmail | null {
  if (name.startsWith(AUTH_PREFIX)) {
    const t = name.slice(AUTH_PREFIX.length) as SupabaseTemplateName;
    if (!SUPABASE_TEMPLATE_NAMES.includes(t)) return null;
    const r = renderSupabaseTemplate(t, { site });
    return {
      subject: r.subject,
      preheader: r.preheader,
      html: fillAuthPlaceholders(r.html, site),
      text: fillAuthPlaceholders(r.text, site),
    };
  }
  if (!(EMAIL_NAMES as string[]).includes(name)) return null;
  const emailName = name as EmailName;
  const fixtures = EMAIL_FIXTURES[emailName];
  const fixture = fixtures.find((f) => f.id === fixtureId) ?? fixtures[0];
  // The footer's "Choose what we email you" follows the Notifications flag, as a real send does.
  return renderEmailWith(emailName, fixture.data as EmailData[EmailName], { site });
}

/** Force the designed dark palette on (the r2c "-dark" files do the same). */
export function forceDark(htmlText: string): string {
  return htmlText.replaceAll("@media (prefers-color-scheme: dark)", "@media all");
}
