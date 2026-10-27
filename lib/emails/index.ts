// lib/emails: every email and text Club Yuppie sends, rendered from typed data.
// The contract is in ./types.ts. Sending (Resend, Twilio, message_log) is
// lib/server/messages (the foundation).

import type { EmailData, EmailName, RenderedEmail, TextData, TextName } from "./types";

export type * from "./types";

export function renderEmail<N extends EmailName>(name: N, data: EmailData[N]): RenderedEmail {
  void data;
  throw new Error(`lib/emails: the ${name} renderer is not built yet`);
}

export function renderText<N extends TextName>(name: N, data: TextData[N]): string {
  void data;
  throw new Error(`lib/emails: the ${name} text is not built yet`);
}
