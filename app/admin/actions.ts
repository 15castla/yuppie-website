"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // Local scope only — this is a routine "sign out of admin" action, not
  // a security event. Supabase's default (global) scope revokes every
  // session for this user on every device, which silently logged Albert
  // out of the member app on his phone too (same account is both member
  // and admin). Local scope ends only this browser's session.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/login");
}
