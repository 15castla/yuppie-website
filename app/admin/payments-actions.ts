"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/server/audit";
import { adminRefundPayment } from "@/lib/server/plan-payments";
import { requireAdmin } from "./require-admin";

/** Admin > Payments > Refund: one Open Invite payment back to the member's card, in full (15 Nov 2026). */
export async function adminRefundPlanPayment(paymentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (typeof paymentId !== "string" || !/^[0-9a-f-]{36}$/i.test(paymentId)) return { ok: false, error: "That payment couldn’t be found." };
  const result = await adminRefundPayment(paymentId);
  if (result.ok) await audit(admin.id, "plan_payment.refund", { type: "plan_payment", id: paymentId }, {});
  revalidatePath("/admin/payments");
  return result;
}
