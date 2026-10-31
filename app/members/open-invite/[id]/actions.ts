"use server";

// One plan's server actions: the page's data again (for a refresh), and the host's edit and cancel. The member's
// own moments (I'm in, withdraw, report) are in ../actions.ts. Same rules: asMember (SESSION_ENDED), Open
// Invite's door, lib/server/plans.ts.

import { revalidatePath } from "next/cache";

import type { NewOpenInvite, OpenInvitePage } from "@/lib/members/invite/types";
import { cancelOpenInvite as cancelPlan, editOpenInvite as editPlan, openInvitePage, type PlanActionResult } from "@/lib/server/plans";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../../action-kit";
import { requireOpenInvite } from "../guard";

const fresh = () => revalidatePath("/members", "layout");

/** The plan page's data, or null when the member may not see it (the page 404s). */
export async function getOpenInvitePage(planId: string): Promise<OpenInvitePage | null | SessionEnded | Failed> {
  await requireOpenInvite();
  return asMember("getOpenInvitePage", (_m, viewer) => openInvitePage(viewer, planId));
}

/**
 * "Edit invite" (the post form again, same fields; a cost is refused in stage 2). A time or place change tells
 * the people going (the plan-changed email or an Update, by their switches; leaving stays open until the start).
 * Fewer places than people going is refused: nobody is taken off a plan by an edit.
 */
export async function editOpenInvite(planId: string, input: NewOpenInvite): Promise<PlanActionResult | SessionEnded | Failed> {
  await requireOpenInvite();
  const result = await asMember("editOpenInvite", (_m, viewer) => editPlan(viewer, planId, input));
  if ("ok" in result && result.ok) fresh();
  return result;
}

/** "Cancel this plan" (the host): everyone going is told (plan-cancelled email or an Update); the plan chat closes. */
export async function cancelOpenInvite(planId: string): Promise<PlanActionResult | SessionEnded | Failed> {
  await requireOpenInvite();
  const result = await asMember("cancelOpenInvite", (_m, viewer) => cancelPlan(viewer, planId));
  if ("ok" in result && result.ok) fresh();
  return result;
}
