import "server-only";

// Applications: the two emails when someone applies (C-D3, C-D7), the
// approval email and welcome text, and Decline (B-D3, B-D9, C-D2, C-D8).

import { stripe } from "@/lib/stripe";
import { adminAlertsEmail } from "./config";
import { errorMessage, serviceDb, stripeErrorCode } from "./db";
import { dayDate, firstName, pounds, time24 } from "./format";
import { sendEmail, sendText } from "./messages";
import { periodEndSeconds } from "./stripe/period";

/** After a successful application: "Thanks for applying" to the applicant, and one alert to the club. */
export async function sendApplicationEmails(applicationId: string): Promise<void> {
  const db = serviceDb();
  const { data: app } = await db
    .from("applications")
    .select("id, created_at, full_name, email, employer, role_title")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return;
  const sent = { date: dayDate(app.created_at), time: time24(app.created_at) };
  const { count } = await db.from("applications").select("*", { count: "exact", head: true }).eq("status", "pending");

  await sendEmail({
    template: "application-received",
    to: app.email,
    data: { fullName: app.full_name, sent },
    dedupeKey: `application-received:${app.id}`,
    refs: { applicationId: app.id },
  });
  await sendEmail({
    template: "admin-new-application",
    to: adminAlertsEmail(),
    data: { fullName: app.full_name, role: app.role_title, employer: app.employer, sent, waiting: count ?? 1 },
    dedupeKey: `admin-new-application:${app.id}`,
    refs: { applicationId: app.id },
  });
}

/** After approve(): the rewritten welcome email and the short welcome text (C-D4). */
export async function sendApprovalMessages(input: {
  applicationId: string;
  memberId: string | null;
  email: string;
  fullName: string | null;
  phone: string | null;
  subscriptionId: string | null;
}): Promise<void> {
  let paid: string | null = null;
  let renewsOn: string | null = null;
  if (input.subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(input.subscriptionId);
      const item = sub.items?.data?.[0];
      if (item?.price?.unit_amount) paid = pounds(item.price.unit_amount);
      const end = periodEndSeconds(sub);
      if (end) renewsOn = dayDate(new Date(end * 1000));
    } catch (err) {
      console.error(`sendApprovalMessages: reading subscription ${input.subscriptionId} failed:`, err);
    }
  }
  await sendEmail({
    template: "approval",
    to: input.email,
    data: { firstName: firstName(input.fullName) || null, loginEmail: input.email, paid, renewsOn },
    dedupeKey: `approval:${input.applicationId}`,
    refs: { applicationId: input.applicationId, memberId: input.memberId },
  });
  if (input.phone) {
    await sendText({
      template: "welcome",
      to: input.phone,
      data: {},
      dedupeKey: `welcome-text:${input.applicationId}`,
      refs: { applicationId: input.applicationId, memberId: input.memberId },
    });
  }
}

export type DeclineResult =
  | { ok: true; cardReleased: boolean; emailed: boolean; alreadyDeclined: boolean }
  | { ok: false; error: string };

/**
 * Decline (the database value stays "rejected", B-D9). Releases the saved
 * card (detaches the payment method, C-D8) and, with the switch on (B-D3,
 * on by default), sends the kind decline email, which says the card was
 * released only when it was. Safe to repeat.
 */
export async function declineApplicationById(
  applicationId: string,
  reviewedBy: string,
  options: { sendEmail: boolean },
): Promise<DeclineResult> {
  try {
    const db = serviceDb();
    const { data: app } = await db
      .from("applications")
      .select("id, status, email, stripe_payment_method_id, card_released_at")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app) return { ok: false, error: "Application not found." };
    if (app.status === "approved") return { ok: false, error: "This application is already approved." };

    const alreadyDeclined = app.status === "rejected";
    if (!alreadyDeclined) {
      const { error } = await db
        .from("applications")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy })
        .eq("id", applicationId)
        .neq("status", "approved");
      if (error) return { ok: false, error: "Saving the decline failed." };
    }

    let cardReleased = Boolean(app.card_released_at);
    if (!cardReleased && app.stripe_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(app.stripe_payment_method_id, {}, { idempotencyKey: `detach-${app.stripe_payment_method_id}` });
        cardReleased = true;
      } catch (err) {
        // Already detached counts as released.
        const message = errorMessage(err);
        if (stripeErrorCode(err) === "resource_missing" || /not attached/i.test(message)) cardReleased = true;
        else console.error(`declineApplication: detaching the card failed for application ${applicationId}:`, err);
      }
      if (cardReleased) await db.from("applications").update({ card_released_at: new Date().toISOString() }).eq("id", applicationId);
    }

    let emailed = false;
    if (options.sendEmail) {
      const result = await sendEmail({
        template: "decline",
        to: app.email,
        data: { cardReleased },
        dedupeKey: `decline:${applicationId}`,
        refs: { applicationId },
      });
      emailed = result.status === "sent";
    }
    return { ok: true, cardReleased, emailed, alreadyDeclined };
  } catch (err) {
    console.error(`declineApplication ${applicationId} failed:`, err);
    return { ok: false, error: "Something went wrong declining that application." };
  }
}
