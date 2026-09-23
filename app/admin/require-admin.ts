import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "./admin-client";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminClient = createAdminSupabaseClient();
  const { data: adminRow } = await adminClient
    .from("admin_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRow) {
    redirect("/");
  }

  // A password-only sign-in only ever reaches aal1. Supabase itself
  // will happily consider that "logged in". Real two-factor enforcement
  // lives here: every /admin/(protected) page requires aal2 (password
  // plus a verified TOTP factor, checked directly against this session's
  // own JWT, not a separate cookie).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel !== "aal2") {
    redirect("/admin/login");
  }

  return user;
}
