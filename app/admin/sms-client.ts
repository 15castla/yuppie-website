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

export async function sendSms({ to, body }: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !messagingServiceSid) {
    throw new Error("Twilio env vars are not fully set — SMS not sent.");
  }

  const toNumber = normalizePhoneToE164(to);
  if (!toNumber) {
    throw new Error(`Could not normalize phone number to E.164: ${to}`);
  }

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
        MessagingServiceSid: messagingServiceSid,
        Body: body,
      }),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Twilio error (${response.status}): ${responseBody}`);
  }
}
