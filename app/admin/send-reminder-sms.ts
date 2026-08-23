import { sendSms } from "./sms-client";

const SITE_URL = "https://clubyuppie.com";

export async function sendReminderSms({
  to,
  inviteCode,
}: {
  to: string;
  inviteCode: string;
}) {
  const signupUrl = `${SITE_URL}/signup?code=${encodeURIComponent(inviteCode)}`;

  await sendSms({
    to,
    body: `Your invitation to Yuppie will expire in 7 days. Set up your account: ${signupUrl}`,
  });
}
