"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/server/audit";
import { cancelMemberNow, pauseMember, resumeMember } from "@/lib/server/membership-actions";
import { membershipState } from "@/lib/server/membership";
import { MEMBER_ROW_COLUMNS, type MemberRow } from "@/lib/server/db";
import { createAdminSupabaseClient } from "./admin-client";
import { requireAdmin } from "./require-admin";

// The member card's status controls (r2b Members: Pause, Resume, Cancel now).
// Each asks about Stripe with the box ticked (B-D2): `stripe: true` changes
// the subscription too (pause collection, resume it, cancel it now), `false`
// changes only the club's record. Cancel now is immediate (B-D23) and
// cancels and refunds the member's future bookings (A-D8). Every call writes
// an admin_audit row.
//
// QA2-13: a card left open while someone else changed the membership gets a
// plain sentence saying what the membership is now ("stale"), and the card
// reloads; nothing is changed. Messages are the admin's own words, never the
// backend's "Something went wrong".

export type MemberStatusResult =
  | { ok: true; stripe: boolean; cancelledBookings?: number }
  | { ok: false; error: string; stale?: boolean };

type Now = "active" | "paused" | "cancelled";

function revalidate(memberId: string) {
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin");
}

async function currentState(memberId: string): Promise<{ member: MemberRow; now: Now; first: string } | null> {
  const { data } = await createAdminSupabaseClient().from("members").select(MEMBER_ROW_COLUMNS).eq("id", memberId).maybeSingle<MemberRow>();
  if (!data) return null;
  const state = membershipState(data).state;
  const now: Now = state === "cancelled" || data.deleted_at ? "cancelled" : state === "paused" ? "paused" : "active";
  const first = data.full_name?.trim().split(/\s+/)[0] || "This member";
  return { member: data, now, first };
}

/** What the membership is now, when it is not what the card showed (the card says "Nothing changed." above it). */
function staleWords(first: string, now: Now, tried: "pause" | "resume" | "cancel"): string {
  if (now === "cancelled") return tried === "cancel" ? `${first}’s membership was cancelled already.` : `${first}’s membership was cancelled since this page opened, so it can’t be ${tried === "pause" ? "paused" : "resumed"}.`;
  if (now === "paused") return `${first}’s membership was paused already.`;
  return `${first}’s membership is active already.`;
}

function plain(code: string, raw: string): string {
  if (code === "stripe") return raw; // "Stripe didn’t … so nothing changed: <Stripe's words>"
  if (code === "not_found") return "That member couldn’t be found.";
  return "We couldn’t save that. Try again in a moment.";
}

const NOT_FOUND: MemberStatusResult = { ok: false, error: "That member couldn’t be found." };

export async function adminPauseMember(memberId: string, options: { stripe: boolean }): Promise<MemberStatusResult> {
  const admin = await requireAdmin();
  if (!memberId) return NOT_FOUND;
  const before = await currentState(memberId);
  if (!before) return NOT_FOUND;
  if (before.now !== "active") {
    await audit(admin.id, "member.pause_refused", { type: "member", id: memberId }, { now: before.now });
    return { ok: false, stale: true, error: staleWords(before.first, before.now, "pause") };
  }
  const result = await pauseMember(memberId, { stripe: options.stripe !== false });
  await audit(admin.id, "member.pause", { type: "member", id: memberId }, { stripe_requested: options.stripe !== false, ...result });
  if (!result.ok) return { ok: false, error: plain(result.code, result.error) };
  revalidate(memberId);
  return { ok: true, stripe: result.stripe };
}

export async function adminResumeMember(memberId: string, options: { stripe: boolean }): Promise<MemberStatusResult> {
  const admin = await requireAdmin();
  if (!memberId) return NOT_FOUND;
  const before = await currentState(memberId);
  if (!before) return NOT_FOUND;
  if (before.now !== "paused") {
    await audit(admin.id, "member.resume_refused", { type: "member", id: memberId }, { now: before.now });
    return { ok: false, stale: true, error: staleWords(before.first, before.now, "resume") };
  }
  const result = await resumeMember(memberId, { stripe: options.stripe !== false });
  await audit(admin.id, "member.resume", { type: "member", id: memberId }, { stripe_requested: options.stripe !== false, ...result });
  if (!result.ok) return { ok: false, error: plain(result.code, result.error) };
  revalidate(memberId);
  return { ok: true, stripe: result.stripe };
}

export async function adminCancelMemberNow(memberId: string, options: { stripe: boolean }): Promise<MemberStatusResult> {
  const admin = await requireAdmin();
  if (!memberId) return NOT_FOUND;
  const before = await currentState(memberId);
  if (!before) return NOT_FOUND;
  if (before.now === "cancelled") {
    await audit(admin.id, "member.cancel_now_refused", { type: "member", id: memberId }, { now: before.now });
    return { ok: false, stale: true, error: staleWords(before.first, before.now, "cancel") };
  }
  const result = await cancelMemberNow(memberId, { stripe: options.stripe !== false });
  await audit(admin.id, "member.cancel_now", { type: "member", id: memberId }, { stripe_requested: options.stripe !== false, ...result });
  if (!result.ok) return { ok: false, error: plain(result.code, result.error) };
  revalidate(memberId);
  return { ok: true, stripe: result.stripe, cancelledBookings: result.cancelledBookings };
}
