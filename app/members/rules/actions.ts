"use server";

// The rules gate's one action: agree, then go on to the page the gate stopped them on (a members page on this site
// only), else the landing page.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SESSION_ENDED_LOGIN } from "@/components/members/session-ended";
import { flags } from "@/lib/members/flags";
import { returnPath } from "@/lib/members/photo/return-path";
import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { serviceDb } from "@/lib/server/db";
import { memberForAction } from "../require-member";

export async function agreeToRules(next: string | null): Promise<void> {
  const member = await memberForAction({ allowNoRules: true });
  if (!member) redirect(SESSION_ENDED_LOGIN);
  if (!member.rules_agreed_at) {
    const { error } = await serviceDb()
      .from("members")
      .update({ rules_agreed_at: new Date().toISOString() })
      .eq("id", member.id)
      .is("rules_agreed_at", null);
    if (error) {
      console.error(`agreeToRules failed for member ${member.id}:`, error);
      throw new Error("Could not save the agreement");
    }
  }
  // Pages visited before agreeing may be cached by the router; drop them, so none bounces back to the gate.
  revalidatePath("/members", "layout");
  redirect(returnPath(typeof next === "string" ? next : null) ?? landingPath(flags, await detectShellMode()));
}
