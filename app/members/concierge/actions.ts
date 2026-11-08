"use server";

// The Concierge's server actions (app only), for the real backend (lib/server/concierge.ts). Each checks the
// member on the server (asMember: SESSION_ENDED when the session has gone; paused and ended members are sent to
// their gate), that the Concierge is on (the flag) and live (CONCIERGE_LIVE and the API key), and that the call
// comes from the app. A 404 otherwise, as the page.

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import type { SessionEnded } from "@/components/members/session-ended";
import type { ConciergeReply, ConciergeSnapshot } from "@/lib/members/concierge/types";
import { flags } from "@/lib/members/flags";
import { ROUTES } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { serviceDb } from "@/lib/server/db";
import { SESSION_ENDED_LOGIN } from "@/components/members/session-ended";
import { memberForAction } from "../require-member";
import { conciergeConsentAt, conciergeLive, forgetAllMemory, forgetMemory, loadConcierge, sendToConcierge } from "@/lib/server/concierge";
import { asMember, type Failed } from "../action-kit";

async function door(): Promise<void> {
  if (!flags.concierge || !conciergeLive()) notFound();
  if ((await detectShellMode()) !== "app") notFound();
}

export async function getConcierge(): Promise<ConciergeSnapshot | SessionEnded | Failed> {
  await door();
  return asMember("getConcierge", (m) => loadConcierge(m.id));
}

// Said when a question arrives without the member's permission (the page shows the permission screen first, so only
// a page left open after Turn off in another window gets here).
const NO_PERMISSION = "Agree to the Concierge first: reopen the Concierge tab.";

/**
 * One question in, one reply out. Fails (Failed) when the AI cannot be reached: the screen says "Not sent". Nothing
 * goes to Anthropic without the member's permission (members.concierge_consent_at, Apple guideline 5.1.2(i)).
 */
export async function sendConciergeMessage(text: string): Promise<ConciergeReply | SessionEnded | Failed> {
  await door();
  return asMember("sendConciergeMessage", async (m) => {
    if (!(await conciergeConsentAt(m.id))) return { ok: false as const, error: NO_PERMISSION };
    const reply = await sendToConcierge(m.id, typeof text === "string" ? text : "");
    // The router's copies of the page (the Concierge tab is fetched ahead, kit/link.tsx) go: coming back to the tab
    // must show this exchange. The screen on view keeps its own state.
    revalidatePath(ROUTES.concierge);
    return reply;
  });
}

/** The permission screen's Agree and continue: saves the permission, then opens the Concierge. */
export async function agreeToConcierge(): Promise<void> {
  await door();
  const member = await memberForAction();
  if (!member) redirect(SESSION_ENDED_LOGIN);
  if (!(await conciergeConsentAt(member.id))) {
    const { error } = await serviceDb().from("members").update({ concierge_consent_at: new Date().toISOString() }).eq("id", member.id);
    if (error) {
      console.error(`agreeToConcierge failed for member ${member.id}:`, error);
      throw new Error("Could not save the permission");
    }
  }
  // Back to the same page: revalidate, or the screen already drawn (the permission screen) would stay.
  revalidatePath(ROUTES.concierge);
  redirect(ROUTES.concierge);
}

/** Turn off the Concierge (the memory sheet): withdraws the permission; the conversation and memory stay. */
export async function turnOffConcierge(): Promise<void> {
  await door();
  const member = await memberForAction();
  if (!member) redirect(SESSION_ENDED_LOGIN);
  const { error } = await serviceDb().from("members").update({ concierge_consent_at: null }).eq("id", member.id);
  if (error) {
    console.error(`turnOffConcierge failed for member ${member.id}:`, error);
    throw new Error("Could not turn the Concierge off");
  }
  revalidatePath(ROUTES.concierge);
  redirect(ROUTES.concierge);
}

export async function forgetConciergeMemory(itemId: string): Promise<{ ok: true } | SessionEnded | Failed> {
  await door();
  return asMember("forgetConciergeMemory", async (m) => {
    await forgetMemory(m.id, typeof itemId === "string" ? itemId : "");
    revalidatePath(ROUTES.concierge);
    return { ok: true as const };
  });
}

export async function forgetAllConciergeMemory(): Promise<{ ok: true } | SessionEnded | Failed> {
  await door();
  return asMember("forgetAllConciergeMemory", async (m) => {
    await forgetAllMemory(m.id);
    revalidatePath(ROUTES.concierge);
    return { ok: true as const };
  });
}
