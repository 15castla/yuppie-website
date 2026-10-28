import "server-only";

// Members for the admin list and card, read with the service role after requireAdmin().

import { cache } from "react";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { membershipState } from "@/lib/server/membership";

export type MemberListRow = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  /** The list's three: active (active, ending, payment problem), paused, cancelled (ended or lapsed). */
  status: "active" | "paused" | "cancelled";
};

export const listMembers = cache(async function listMembers(): Promise<MemberListRow[]> {
  await requireAdmin();
  const { data, error } = await createAdminSupabaseClient()
    .from("members")
    .select("id, full_name, email, avatar_url, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new Error(`members list: ${error.message}`);
  const now = new Date();
  return (data ?? []).map((m) => {
    const state = membershipState(m, now).state;
    return {
      id: m.id as string,
      name: (m.full_name as string | null)?.trim() || (m.email as string),
      email: m.email as string,
      photoUrl: (m.avatar_url as string | null) ?? null,
      status: state === "paused" ? "paused" : state === "cancelled" ? "cancelled" : "active",
    };
  });
});
