import "server-only";

// One admin_audit row per admin action. Never throws: an audit write that
// fails is logged, and the action it records has already happened.

import { serviceDb } from "./db";

export type AuditTarget = { type: string; id: string | null | undefined };

export async function audit(
  adminId: string | null | undefined,
  action: string,
  target: AuditTarget | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await serviceDb().from("admin_audit").insert({
      admin_id: adminId ?? null,
      action,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
      details,
    });
    if (error) console.error(`audit write failed (${action}):`, error);
  } catch (err) {
    console.error(`audit write failed (${action}):`, err);
  }
}
