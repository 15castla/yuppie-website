import { renderBrandedEmailHtml } from "./email-template";
import { sendEmail } from "./resend-client";

const SITE_URL = "https://clubyuppie.com";

export async function sendReminderEmail({
  to,
  fullName,
  inviteCode,
}: {
  to: string;
  fullName: string | null;
  inviteCode: string;
}) {
  const firstName = fullName?.trim().split(" ")[0] || "there";
  const signupUrl = `${SITE_URL}/signup?code=${encodeURIComponent(inviteCode)}`;

  const html = renderBrandedEmailHtml({
    documentTitle: "Your Yuppie invitation expires in 7 days",
    heading: `Don't miss out, ${firstName}!`,
    bodyText:
      "Your invitation to Yuppie will expire in 7 days. Set up your account below before it's gone.",
    ctaLabel: "Set up your account",
    ctaUrl: signupUrl,
    footerText: "This link expires in 7 days.",
  });

  await sendEmail({
    to,
    subject: "Your Yuppie invitation expires in 7 days",
    html,
  });
}
