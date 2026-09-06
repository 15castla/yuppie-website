import { sendSms } from "./sms-client";

const SITE_URL = "https://clubyuppie.com";

export async function sendWelcomeSms({ to }: { to: string }) {
  const loginUrl = `${SITE_URL}/member-login`;

  await sendSms({
    to,
    body: `Your application to Yuppie has been approved! Log in any time: ${loginUrl}`,
  });
}
