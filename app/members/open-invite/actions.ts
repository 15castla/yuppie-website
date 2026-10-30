"use server";

// Open Invite's server actions (the browse page, Yours, the post form, and the moments a member has with a plan:
// I'm in, withdraw, report). They return the shapes in lib/members/invite/types.ts, so the screens swap their
// stand-ins (components/members/invite/demo-state.ts, demo-posted.ts, use-moments.tsx) for these. Each checks
// the member on the server (asMember: SESSION_ENDED when the session has gone), and Open Invite's door
// (requireOpenInvite: the flag, and the app's own switch). The rules are lib/server/plans.ts's.
//
// Paid plans: nothing here takes or pretends to take money. A cost in the post form is refused while the
// server-only switch MEMBERS_PAID_PLANS_LIVE is off (always, in stage 2).

import { revalidatePath } from "next/cache";

import type { NewOpenInvite, NewOpenInviteContext, OpenInviteFeed, OpenInviteYours } from "@/lib/members/invite/types";
import {
  joinOpenInvite as joinPlan,
  newInviteContext,
  openInviteFeed,
  openInviteYours,
  postOpenInvite as postPlan,
  withdrawFromOpenInvite as withdrawPlan,
  type JoinResult,
  type PostInviteResult,
  type WithdrawResult,
} from "@/lib/server/plans";
import { createReport, type CreateReportResult } from "@/lib/server/reports";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../action-kit";
import { requireOpenInvite } from "./guard";

const fresh = () => revalidatePath("/members", "layout");

/** The browse page's data again (the page loads it itself; this is for a refresh without a navigation). */
export async function getOpenInviteFeed(): Promise<OpenInviteFeed | SessionEnded | Failed> {
  await requireOpenInvite();
  return asMember("getOpenInviteFeed", (_m, viewer) => openInviteFeed(viewer));
}

export async function getOpenInviteYours(): Promise<OpenInviteYours | SessionEnded | Failed> {
  await requireOpenInvite();
  return asMember("getOpenInviteYours", (_m, viewer) => openInviteYours(viewer));
}

export async function getNewOpenInviteContext(): Promise<NewOpenInviteContext | SessionEnded | Failed> {
  await requireOpenInvite();
  return asMember("getNewOpenInviteContext", (_m, viewer) => newInviteContext(viewer));
}

/**
 * "Post Open Invite". Every form rule again on the server; field errors come back under the form's own field
 * names (`errors`), anything else as `error`. On success: the new plan's id (the "Posted." page loads it as
 * /members/open-invite/new/done?id=<id>) and the plan itself.
 */
export async function postOpenInvite(input: NewOpenInvite): Promise<PostInviteResult | SessionEnded | Failed> {
  await requireOpenInvite();
  const result = await asMember("postOpenInvite", (_m, viewer) => postPlan(viewer, input));
  if ("ok" in result && result.ok) fresh();
  return result;
}

/**
 * "I'm in" on a free plan. The place is taken under the plan's row lock (two members, one last place: one gets
 * it, the other gets reason "full", the TakenSheet). Answers the plan as it is now, with the member's chat.
 */
export async function joinOpenInvite(planId: string): Promise<JoinResult | SessionEnded | Failed> {
  await requireOpenInvite();
  const result = await asMember("joinOpenInvite", (_m, viewer) => joinPlan(viewer, planId));
  if ("ok" in result && result.ok) fresh();
  return result;
}

/** "Withdraw from this plan": open until the plan starts (free plans). Answers the plan as it is now. */
export async function withdrawFromOpenInvite(planId: string): Promise<WithdrawResult | SessionEnded | Failed> {
  await requireOpenInvite();
  const result = await asMember("withdrawFromOpenInvite", (_m, viewer) => withdrawPlan(viewer, planId));
  if ("ok" in result && result.ok) fresh();
  return result;
}

/**
 * Report a plan (the Open Invite sheet: send the reason's label as the sheet has it, or its id). Every report
 * emails the club. Reporting the same plan again while the first report is open is the same report.
 */
export async function reportOpenInvite(planId: string, reason: string): Promise<CreateReportResult | SessionEnded | Failed> {
  await requireOpenInvite();
  return asMember("reportOpenInvite", (_m, viewer) => createReport(viewer, { target: { kind: "plan", planId }, reason }));
}
