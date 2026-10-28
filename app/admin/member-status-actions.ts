"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/server/audit";
import { cancelMemberNow, pauseMember, resumeMember } from "@/lib/server/membership-actions";
import { requireAdmin } from "./require-admin";

// The member card's status controls (r2b Members: Pause, Resume, Cancel now).
// Each asks about Stripe with the box ticked (B-D2): `stripe: true` changes
// the subscription too (pause collection, resume it, cancel it now), `false`
// changes only the club's record. Cancel now is immediate (B-D23) and
// cancels and refunds the member's future bookings (A-D8). Every call writes
// an admin_audit row.

export type MemberStatusResult = { ok: true; stripe: boolean; cancelledBookings?: number } | { ok: false; error: string };

function revalidate(memberId: string) {
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin");
}

export async function adminPauseMember(memberId: string, options: { stripe: boolean }): Promise<MemberStatusResult> {
  const admin = await requireAdmin();
  if (!memberId) return { ok: false, error: "Missing member." };
  const result = await pauseMember(memberId, { stripe: options.stripe !== false });
  await audit(admin.id, "member.pause", { type: "member", id: memberId }, { stripe_requested: options.stripe !== false, ...result });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(memberId);
  return { ok: true, stripe: result.stripe };
}

export async function adminResumeMember(memberId: string, options: { stripe: boolean }): Promise<MemberStatusResult> {
  const admin = await requireAdmin();
  if (!memberId) return { ok: false, error: "Missing member." };
  const result = await resumeMember(memberId, { stripe: options.stripe !== false });
  await audit(admin.id, "member.resume", { type: "member", id: memberId }, { stripe_requested: options.stripe !== false, ...result });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(memberId);
  return { ok: true, stripe: result.stripe };
}

export async function adminCancelMemberNow(memberId: string, options: { stripe: boolean }): Promise<MemberStatusResult> {
  const admin = await requireAdmin();
  if (!memberId) return { ok: false, error: "Missing member." };
  const result = await cancelMemberNow(memberId, { stripe: options.stripe !== false });
  await audit(admin.id, "member.cancel_now", { type: "member", id: memberId }, { stripe_requested: options.stripe !== false, ...result });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate(memberId);
  return { ok: true, stripe: result.stripe, cancelledBookings: result.cancelledBookings };
}
