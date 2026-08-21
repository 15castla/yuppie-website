const SITE_URL = "https://clubyuppie.com";

function normalizePhoneToE164(phone: string): string | null {
  const trimmed = phone.replace(/[^\d+]/g, "");

  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  if (trimmed.startsWith("0")) {
    // UK national format (e.g. 07123 456789) -> E.164
    return `+44${trimmed.slice(1)}`;
  }
  if (trimmed.startsWith("44")) {
    return `+${trimmed}`;
  }

  return null;
}

export async function sendWelcomeSms({
  to,
  inviteCode,
}: {
  to: string;
  inviteCode: string;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !apiKeySid || !apiKeySecret || !fromNumber) {
    throw new Error(
      "Twilio env vars are not fully set — welcome SMS not sent.",
    );
  }

  const toNumber = normalizePhoneToE164(to);
  if (!toNumber) {
    throw new Error(`Could not normalize phone number to E.164: ${to}`);
  }

  const signupUrl = `${SITE_URL}/signup?code=${encodeURIComponent(inviteCode)}`;
  const body = `You're in! Set up your account: ${signupUrl}`;

  const credentials = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString(
    "base64",
  );

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Body: body,
      }),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Twilio error (${response.status}): ${responseBody}`);
  }
}
