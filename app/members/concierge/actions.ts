"use server";

// The Concierge's server actions (app only), for the real backend (lib/server/concierge.ts). Each checks the
// member on the server (asMember: SESSION_ENDED when the session has gone; paused and ended members are sent to
// their gate), that the Concierge is on (the flag) and live (CONCIERGE_LIVE and the API key), and that the call
// comes from the app. A 404 otherwise, as the page.

import { notFound } from "next/navigation";

import type { SessionEnded } from "@/components/members/session-ended";
import type { ConciergeReply, ConciergeSnapshot } from "@/lib/members/concierge/types";
import { flags } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { conciergeLive, forgetAllMemory, forgetMemory, loadConcierge, sendToConcierge } from "@/lib/server/concierge";
import { asMember, type Failed } from "../action-kit";

async function door(): Promise<void> {
  if (!flags.concierge || !conciergeLive()) notFound();
  if ((await detectShellMode()) !== "app") notFound();
}

export async function getConcierge(): Promise<ConciergeSnapshot | SessionEnded | Failed> {
  await door();
  return asMember("getConcierge", (m) => loadConcierge(m.id));
}

/** One question in, one reply out. Fails (Failed) when the AI cannot be reached: the screen says "Not sent". */
export async function sendConciergeMessage(text: string): Promise<ConciergeReply | SessionEnded | Failed> {
  await door();
  return asMember("sendConciergeMessage", (m) => sendToConcierge(m.id, typeof text === "string" ? text : ""));
}

export async function forgetConciergeMemory(itemId: string): Promise<{ ok: true } | SessionEnded | Failed> {
  await door();
  return asMember("forgetConciergeMemory", async (m) => {
    await forgetMemory(m.id, typeof itemId === "string" ? itemId : "");
    return { ok: true as const };
  });
}

export async function forgetAllConciergeMemory(): Promise<{ ok: true } | SessionEnded | Failed> {
  await door();
  return asMember("forgetAllConciergeMemory", async (m) => {
    await forgetAllMemory(m.id);
    return { ok: true as const };
  });
}
