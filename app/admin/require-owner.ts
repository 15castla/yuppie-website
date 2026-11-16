import { cache } from "react";
import { redirect } from "next/navigation";

import { createAdminSupabaseClient } from "./admin-client";
import { requireAdmin } from "./require-admin";

// The Outreach Desk is the owner's only (Albert, 15 Nov 2026): admin_users.is_owner, set once by
// release/set-desk-owner.sql and never by the app. Any other admin (Kira) is sent to /admin/no-access, which says
// "You don't have access to this page." Every desk page and every desk action calls requireOwner() itself, as every
// admin page calls requireAdmin() (a soft navigation can skip the layouts above it).

/** True when this admin is the owner. False when the column doesn't exist yet (before the migration). */
export const isOwner = cache(async function isOwner(userId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabaseClient().from("admin_users").select("is_owner").eq("id", userId).maybeSingle();
  if (error) return false;
  return data?.is_owner === true;
});

/** The signed-in owner (aal2, an admin, the owner), or a redirect: to log in, home, or the no-access page. */
export const requireOwner = cache(async function requireOwner() {
  const user = await requireAdmin();
  if (!(await isOwner(user.id))) redirect("/admin/no-access");
  return user;
});
