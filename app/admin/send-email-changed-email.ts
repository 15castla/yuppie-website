import { renderWelcomeEmailHtml } from "./email-template";
import { sendEmail } from "./resend-client";

const SUPPORT_EMAIL = "hello@clubyuppie.com";

// The new address is typed by the member, so it's escaped before going
// into the HTML; the template interpolates its fields as-is.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Security notice sent to a member's previous address once a login-email
// change has gone through (see verifyEmailChange in
// app/members/profile/actions.ts), so the old inbox hears about it even
// if someone else made the change. Same branded template as the welcome
// email.
export async function sendEmailChangedEmail({
  to,
  newEmail,
}: {
  to: string;
  newEmail: string;
}) {
  const safeNewEmail = escapeHtml(newEmail);

  const html = renderWelcomeEmailHtml({
    documentTitle: "Your Yuppie login email was changed",
    preheaderText: `Your Yuppie login email is now ${safeNewEmail}.`,
    heading: "Your login email was changed",
    bodyText: `Your Yuppie account's login email was changed to <strong>${safeNewEmail}</strong>. If you made this change, no action is needed. If you didn't, please contact us at <a href="mailto:${SUPPORT_EMAIL}" class="text-dark" style="color:#1B1512;font-weight:700;">${SUPPORT_EMAIL}</a> right away.`,
    ctaLabel: "Contact us",
    ctaUrl: `mailto:${SUPPORT_EMAIL}`,
    footerText: "We sent this to the email address previously on your Yuppie account.",
  });

  await sendEmail({
    to,
    subject: "Your Yuppie login email was changed",
    html,
  });
}
