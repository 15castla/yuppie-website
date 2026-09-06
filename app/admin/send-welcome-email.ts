import { renderBrandedEmailHtml } from "./email-template";
import { sendEmail } from "./resend-client";

const SITE_URL = "https://clubyuppie.com";

export async function sendWelcomeEmail({
  to,
  fullName,
}: {
  to: string;
  fullName: string | null;
}) {
  const firstName = fullName?.trim().split(" ")[0] || "there";
  const loginUrl = `${SITE_URL}/member-login`;

  const html = renderBrandedEmailHtml({
    documentTitle: "You're in - welcome to Yuppie",
    heading: `You're in, ${firstName}!`,
    bodyText:
      "Your application to Yuppie has been approved and your account is ready. Click below to log in with your email.",
    ctaLabel: "Log in",
    ctaUrl: loginUrl,
    footerText: "You can log in any time using this email address.",
  });

  await sendEmail({
    to,
    subject: "You're in - welcome to Yuppie",
    html,
  });
}
