import "server-only";

// Sending: every email (Resend), text (Twilio) and phone notification (APNs,
// lib/server/push) the members backend sends goes through here, and every one
// is written to message_log.
//
// - A repeated dedupeKey whose earlier send went out is skipped (no second
//   send, no second row). A key whose earlier send failed or was skipped is
//   tried again, and its row updated.
// - Never throws: a failure is logged and returned. Callers that should not
//   keep the member waiting call these inside after().
//
// Rendering is lib/emails (the emails agent), reached only through ./render.

import { sendSms } from "@/app/admin/sms-client";
import { sendApns, type ApnsEnvironment } from "../push/apns";
import { EMAIL_FROM, EMAIL_REPLY_TO, TEXT_LIMITS, adminAlertsEmail } from "../config";
import { errorMessage, serviceDb } from "../db";
import {
  renderAdminAlert,
  renderEmailMessage,
  renderTextMessage,
  type EmailData,
  type EmailName,
  type RenderedEmail,
  type TextData,
  type TextName,
} from "./render";

export type MessageRefs = {
  memberId?: string | null;
  applicationId?: string | null;
  bookingId?: string | null;
  eventId?: string | null;
  // stage 2
  planId?: string | null;
  chatId?: string | null;
  reportId?: string | null;
  photoId?: string | null;
};

export type SendResult = {
  status: "sent" | "failed" | "skipped";
  providerId?: string | null;
  error?: string;
};

type Channel = "email" | "sms" | "push";

type LogRow = {
  channel: Channel;
  template: string;
  dedupe_key: string | null;
  to_address: string | null;
  member_id: string | null;
  application_id: string | null;
  booking_id: string | null;
  event_id: string | null;
  plan_id: string | null;
  chat_id: string | null;
  report_id: string | null;
  photo_id: string | null;
  status: SendResult["status"];
  provider_id: string | null;
  error: string | null;
};

async function alreadySent(dedupeKey: string | null | undefined): Promise<boolean> {
  if (!dedupeKey) return false;
  const { data, error } = await serviceDb()
    .from("message_log")
    .select("status")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) {
    // Unknown: send rather than lose the message (a duplicate is the lesser harm).
    console.error(`message_log lookup failed for ${dedupeKey}:`, error);
    return false;
  }
  return data?.status === "sent";
}

async function writeLog(row: LogRow): Promise<void> {
  const db = serviceDb();
  const result = row.dedupe_key
    ? await db.from("message_log").upsert({ ...row, created_at: new Date().toISOString() }, { onConflict: "dedupe_key" })
    : await db.from("message_log").insert(row);
  if (result.error) console.error(`message_log write failed (${row.template}, ${row.dedupe_key ?? "no key"}):`, result.error);
}

function stage2Refs(refs: MessageRefs | undefined) {
  return {
    plan_id: refs?.planId ?? null,
    chat_id: refs?.chatId ?? null,
    report_id: refs?.reportId ?? null,
    photo_id: refs?.photoId ?? null,
  };
}

async function deliver(
  channel: Channel,
  template: string,
  to: string | null | undefined,
  dedupeKey: string | null | undefined,
  refs: MessageRefs | undefined,
  send: (to: string) => Promise<string | null>,
): Promise<SendResult> {
  const base = {
    channel,
    template,
    dedupe_key: dedupeKey ?? null,
    to_address: to ?? null,
    member_id: refs?.memberId ?? null,
    application_id: refs?.applicationId ?? null,
    booking_id: refs?.bookingId ?? null,
    event_id: refs?.eventId ?? null,
    ...stage2Refs(refs),
  };
  try {
    if (await alreadySent(dedupeKey)) return { status: "skipped", error: "already sent" };
    if (!to?.trim()) {
      await writeLog({ ...base, status: "skipped", provider_id: null, error: "no address" });
      return { status: "skipped", error: "no address" };
    }
    let providerId: string | null = null;
    try {
      providerId = await send(to.trim());
    } catch (err) {
      const error = errorMessage(err).slice(0, 1000);
      console.error(`${channel} ${template} to ${to} failed:`, err);
      await writeLog({ ...base, status: "failed", provider_id: null, error });
      return { status: "failed", error };
    }
    await writeLog({ ...base, status: "sent", provider_id: providerId, error: null });
    return { status: "sent", providerId };
  } catch (err) {
    console.error(`message service: ${template} failed unexpectedly:`, err);
    return { status: "failed", error: errorMessage(err) };
  }
}

async function resendSend(to: string, rendered: RenderedEmail, idempotencyKey: string | null | undefined): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set, so the email was not sent.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      reply_to: EMAIL_REPLY_TO,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Resend error (${response.status}): ${body.slice(0, 500)}`);
  try {
    const parsed = JSON.parse(body) as { id?: string };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

/** Render one lib/emails email and send it through Resend. */
export async function sendEmail<N extends EmailName>(input: {
  template: N;
  to: string | null | undefined;
  data: EmailData[N];
  dedupeKey?: string | null;
  refs?: MessageRefs;
}): Promise<SendResult> {
  return deliver("email", input.template, input.to, input.dedupeKey, input.refs, async (to) => {
    const rendered = renderEmailMessage(input.template, input.data);
    return resendSend(to, rendered, input.dedupeKey);
  });
}

/** Texts that went to this member in the last 24 hours (sent rows in message_log), for the daily cap. */
export async function textsSentToday(memberId: string, template?: string): Promise<number> {
  let q = serviceDb()
    .from("message_log")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("channel", "sms")
    .eq("status", "sent")
    .gte("created_at", new Date(Date.now() - 24 * 3600000).toISOString());
  if (template) q = q.eq("template", template);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Render one lib/emails text and send it through Twilio. A member who has had TEXT_LIMITS.perMemberPerDay texts
 * in the last 24 hours gets no more today: the text is skipped and logged (QB2-02, QB3-12).
 */
export async function sendText<N extends TextName>(input: {
  template: N;
  to: string | null | undefined;
  data: TextData[N];
  dedupeKey?: string | null;
  refs?: MessageRefs;
}): Promise<SendResult> {
  const memberId = input.refs?.memberId;
  if (memberId && input.dedupeKey) {
    try {
      if (!(await alreadySent(input.dedupeKey)) && (await textsSentToday(memberId)) >= TEXT_LIMITS.perMemberPerDay) {
        await logSkipped({ channel: "sms", template: input.template, to: input.to, dedupeKey: input.dedupeKey, reason: `daily text limit: ${TEXT_LIMITS.perMemberPerDay} in 24 hours`, refs: input.refs });
        return { status: "skipped", error: "daily text limit" };
      }
    } catch (err) {
      // Unknown: send rather than lose a reminder (the cap is a guard against floods, not the only one).
      console.error(`message service: the daily text count for ${memberId} failed:`, err);
    }
  }
  return deliver("sms", input.template, input.to, input.dedupeKey, input.refs, async (to) => {
    const body = renderTextMessage(input.template, input.data);
    await sendSms({ to, body });
    return null;
  });
}

export type PushInput = {
  /** What it is about, for message_log (e.g. "push-plan-joined"). */
  template: string;
  memberId: string;
  /** The bold first line: the plan, event or person (lib/server/push/words.ts); "Club Yuppie" when none is given. */
  title?: string;
  /** A second bold line (a chat message: the plan). */
  subtitle?: string;
  /** What happened, or what was said. */
  body: string;
  /** The members page a tap opens. */
  path: string;
  /** iOS groups notifications by this (a plan, an event). */
  thread?: string;
  /** A newer notification with the same id replaces this one (a chat). */
  collapseId?: string;
  /** Quiet hours: delivered without a sound or lighting the screen (decision 2 B). */
  quiet?: boolean;
  /** Shown as usual but without a sound (the next messages of a burst in a chat). */
  silent?: boolean;
  /** Apple stops trying after this (a reminder after its start). */
  expiresAt?: string | null;
  /**
   * A chat message: who sent it and in which chat, so the app shows it as a messaging app does, with the sender's
   * photo and a small Club Yuppie icon (mobile/ios/App/NotificationService). `photo` is a signed URL that runs out
   * in 10 minutes (QB2-08); without it, or in an app build from before this, the notification reads the same,
   * with the app icon.
   */
  conversation?: { chatId: string; name: string; senderId: string; senderName: string; photo: string | null };
  dedupeKey: string;
  refs?: MessageRefs;
};

/**
 * One phone notification to every iPhone a member is signed in on. Logged like an email: a dedupe key that went
 * out is never sent again; a member with no device is a "skipped" row ("no device"). Devices Apple no longer knows
 * are removed. Sent when at least one device took it; failed when none did.
 */
export async function sendPush(input: PushInput): Promise<SendResult> {
  const db = serviceDb();
  const refs = { ...input.refs, memberId: input.memberId };
  let devices: { token: string; environment: ApnsEnvironment }[] = [];
  try {
    const { data, error } = await db.from("push_devices").select("token, environment").eq("member_id", input.memberId);
    if (error) throw error;
    devices = (data ?? []) as typeof devices;
  } catch (err) {
    console.error(`push ${input.template}: devices for ${input.memberId} failed:`, err);
    return { status: "failed", error: errorMessage(err) };
  }
  if (!devices.length) {
    await logSkipped({ channel: "push", template: input.template, to: null, dedupeKey: input.dedupeKey, reason: "no device", refs });
    return { status: "skipped", error: "no device" };
  }
  const payload = {
    aps: {
      alert: { title: input.title || "Club Yuppie", ...(input.subtitle ? { subtitle: input.subtitle } : {}), body: input.body },
      ...(input.quiet ? { "interruption-level": "passive" } : input.silent ? {} : { sound: "default" }),
      ...(input.thread ? { "thread-id": input.thread } : {}),
      // The app's notification service adds the sender's photo before the phone shows it.
      ...(input.conversation ? { "mutable-content": 1 } : {}),
    },
    path: input.path,
    ...(input.conversation
      ? {
          sender: { id: input.conversation.senderId, name: input.conversation.senderName, ...(input.conversation.photo ? { photo: input.conversation.photo } : {}) },
          chat: { id: input.conversation.chatId, name: input.conversation.name },
        }
      : {}),
  };
  const expiration = input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : undefined;
  return deliver("push", input.template, `${devices.length} device${devices.length === 1 ? "" : "s"}`, input.dedupeKey, refs, async () => {
    const results = await sendApns(devices.map((d) => ({ token: d.token, environment: d.environment, payload, collapseId: input.collapseId, expiration })));
    const gone = results.filter((r) => r.gone).map((r) => r.token);
    if (gone.length) {
      const { error } = await db.from("push_devices").delete().in("token", gone);
      if (error) console.error("push: removing devices Apple no longer knows failed:", error);
    }
    const ok = results.filter((r) => r.status === 200).length;
    if (!ok) throw new Error(`APNs: ${results.map((r) => `${r.status || "no answer"} ${r.reason ?? ""}`.trim()).join("; ")}`.slice(0, 900));
    return `apns ${ok}/${results.length}`;
  });
}

/** A plain alert to the admin inbox (ADMIN_ALERTS_EMAIL) for cases lib/emails has no design for yet. */
export async function sendAdminAlert(input: {
  subject: string;
  heading: string;
  lines: string[];
  dedupeKey?: string | null;
  refs?: MessageRefs;
}): Promise<SendResult> {
  return deliver("email", "admin-alert", adminAlertsEmail(), input.dedupeKey, input.refs, async (to) =>
    resendSend(to, renderAdminAlert(input), input.dedupeKey),
  );
}

/**
 * Record a send that did not happen on purpose (a text held for quiet hours, a reminder skipped because the plan
 * is too close now): a "skipped" row under the same dedupe key, so a later send with that key still goes (only a
 * "sent" row stops it). Never throws.
 */
export async function logSkipped(input: {
  channel: Channel;
  template: string;
  to: string | null | undefined;
  dedupeKey: string;
  reason: string;
  refs?: MessageRefs;
}): Promise<void> {
  try {
    if (await alreadySent(input.dedupeKey)) return;
    await writeLog({
      channel: input.channel,
      template: input.template,
      dedupe_key: input.dedupeKey,
      to_address: input.to ?? null,
      member_id: input.refs?.memberId ?? null,
      application_id: input.refs?.applicationId ?? null,
      booking_id: input.refs?.bookingId ?? null,
      event_id: input.refs?.eventId ?? null,
      ...stage2Refs(input.refs),
      status: "skipped",
      provider_id: null,
      error: input.reason,
    });
  } catch (err) {
    console.error(`message service: logging a skipped ${input.template} failed:`, err);
  }
}

/** Whether a send under this key has gone out already (for callers that claim before rendering). */
export async function wasSent(dedupeKey: string): Promise<boolean> {
  return alreadySent(dedupeKey);
}
