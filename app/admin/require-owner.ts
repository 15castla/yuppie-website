import { cache } from "react";
import { redirect } from "next/navigation";

import { createAdminSupabaseClient } from "./admin-client";
import { requireAdmin } from "./require-admin";

// Who may use the Outreach Desk. Until 19 Nov 2026 it was the owner's only (admin_users.is_owner, set once by
// release/set-desk-owner.sql). Since then it is a team desk (Albert, 19 Nov: Kira joins with the same powers): the owner
// and any admin with admin_users.desk_access (set by release/add-desk-admin.sql, never by the app). Any other admin is
// sent to /admin/no-access ("You don't have access to this page."). Every desk page and every desk action calls
// requireDesk() itself, as every admin page calls requireAdmin() (a soft navigation can skip the layouts above it).
// What stays the owner's: the Desk connector (Alex), the Outlook drafter's link and the 06:30 email (requireOwner()).

/** True when this admin is the owner. False when the column doesn't exist yet (before the migration). */
export const isOwner = cache(async function isOwner(userId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabaseClient().from("admin_users").select("is_owner").eq("id", userId).maybeSingle();
  if (error) return false;
  return data?.is_owner === true;
});

/** True when this admin may use the desk: the owner, or desk_access (false before the 20 Nov migration, unless owner). */
export const hasDesk = cache(async function hasDesk(userId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabaseClient().from("admin_users").select("is_owner, desk_access").eq("id", userId).maybeSingle();
  if (error) return isOwner(userId);
  return data?.is_owner === true || data?.desk_access === true;
});

/** The signed-in owner (aal2, an admin, the owner), or a redirect: to log in, home, or the no-access page. */
export const requireOwner = cache(async function requireOwner() {
  const user = await requireAdmin();
  if (!(await isOwner(user.id))) redirect("/admin/no-access");
  return user;
});

/** Someone on the desk team (aal2, an admin, the owner or desk_access), or a redirect, as requireOwner(). */
export const requireDesk = cache(async function requireDesk() {
  const user = await requireAdmin();
  if (!(await hasDesk(user.id))) redirect("/admin/no-access");
  return user;
});
