// The three Supabase Auth emails (r2c 4, 5 and 23), drawn in the same shell.
// Supabase sends them, not us: the files in supabase/templates/ are these,
// written by tests/e2e/phase-a/emails/build-supabase-templates.mjs, and
// supabase/config.toml points at them with the subjects. Supabase fills the
// {{ .Token }}, {{ .Email }}, {{ .NewEmail }}, {{ .SiteURL }} and
// {{ .TokenHash }} placeholders. The 10 minutes in the words must match
// otp_expiry = 600 (C-D5).

import { DEFAULT_SITE_URL, SUPPORT_EMAIL } from "./config";
import { inlineLink, join } from "./escape";
import { renderSpec, type EmailSpec, type RenderOptions } from "./shell";
import type { RenderedEmail } from "./types";

const INK = "#1B1512";

export type SupabaseTemplateName = "magic_link" | "email_change" | "recovery";

/** The [auth.email.template.<name>] subject for each file. */
export const SUPABASE_SUBJECTS: Record<SupabaseTemplateName, string> = {
  magic_link: "Your Club Yuppie login code",
  email_change: "Confirm your new Club Yuppie email",
  recovery: "Reset your Club Yuppie admin password",
};

const SPECS: Record<SupabaseTemplateName, EmailSpec> = {
  // 4. Login: a code, never a link (Outlook's Safe Links would use a link up).
  magic_link: {
    subject: SUPABASE_SUBJECTS.magic_link,
    pre: "It works once and expires in 10 minutes. If you didn’t ask for it, ignore this email.",
    label: "Login",
    h1: { a: "Your login", b: "code.", br: false },
    intro: ["Enter this code to log in to Club Yuppie. It works once and expires in 10 minutes."],
    blocks: [{ kind: "code", code: "{{ .Token }}" }],
    below: "Didn’t ask for this? Ignore this email. Nobody can log in without the code, and we’ll never ask you for it.",
    belowBig: true,
    foot: "member",
    why: "We sent this to {{ .Email }} because someone asked to log in to Club Yuppie.",
    always: "We always send login emails.",
  },
  // 5. The code that confirms a new login email, sent to the new address.
  email_change: {
    subject: SUPABASE_SUBJECTS.email_change,
    pre: "Enter this code to change your login email. It expires in 10 minutes.",
    label: "Account",
    h1: { a: "Confirm your", b: "new email.", br: true },
    intro: ["Enter this code to change your Club Yuppie login email. It works once and expires in 10 minutes."],
    blocks: [
      {
        kind: "code",
        code: "{{ .Token }}",
        rows: [
          { label: "From", value: "{{ .Email }}" },
          { label: "To", value: "{{ .NewEmail }}" },
        ],
      },
    ],
    below: join(
      "Didn’t ask for this? Ignore this email and nothing changes. If it keeps happening, email ",
      inlineLink(SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`, INK),
      ".",
    ),
    belowBig: true,
    foot: "member",
    why: "We sent this to {{ .NewEmail }} because someone asked to change a Club Yuppie login email to this address.",
    always: "We always send account emails.",
  },
  // 23. Admin password reset: the one email with a link, because the reset page needs it.
  recovery: {
    subject: SUPABASE_SUBJECTS.recovery,
    pre: "The link works once and expires in 10 minutes.",
    label: "Admin",
    h1: { a: "Reset your", b: "password.", br: false },
    intro: ["Someone asked to reset the password for the Club Yuppie admin console. If that was you, choose a new one."],
    button: {
      label: "Choose a new password",
      url: "{{ .SiteURL }}/admin/reset-confirm?token_hash={{ .TokenHash }}&type=recovery",
    },
    below: "This link works once and expires in 10 minutes. If it wasn’t you, ignore this email and your password stays the same.",
    belowBig: true,
    foot: "admin",
    why: "We sent this to {{ .Email }} because someone asked to reset an admin password.",
  },
};

export const SUPABASE_TEMPLATE_NAMES = Object.keys(SPECS) as SupabaseTemplateName[];

/**
 * A Supabase template, with its placeholders left in. Images and the footer
 * links point at the live site (https://clubyuppie.com) whatever the env,
 * because the file is pasted into the live project.
 */
export function renderSupabaseTemplate(name: SupabaseTemplateName, options: RenderOptions = {}): RenderedEmail {
  return renderSpec(SPECS[name], { site: DEFAULT_SITE_URL, notificationsLink: false, ...options });
}
