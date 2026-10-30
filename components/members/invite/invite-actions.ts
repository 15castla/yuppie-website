"use client";

// What Open Invite's screens call when a member does something: I'm in, withdraw, report, the host's cancel,
// post and edit. The real pages use LIVE_INVITE_ACTIONS (the server actions in app/members/open-invite: the
// rules are lib/server/plans.ts's, under the plan's row lock). The preview harness passes its own stand-ins
// (./preview.tsx, through InviteActionsContext), so a screen can be pressed there with no login and no database.
//
// Every answer may also be SESSION_ENDED (the page sends the browser to Log in with "Your session ended.") or
// a plain failure ({ ok: false, error }, words for the member).

import { createContext, useContext } from "react";

import { joinOpenInvite, postOpenInvite, reportOpenInvite, withdrawFromOpenInvite } from "@/app/members/open-invite/actions";
import { cancelOpenInvite, editOpenInvite } from "@/app/members/open-invite/[id]/actions";
import type { SessionEnded } from "@/components/members/session-ended";
import type { InviteMember, NewOpenInvite, OpenInvite } from "@/lib/members/invite/types";
import type { CreateReportResult } from "@/lib/server/reports";
import type { JoinResult, PlanActionResult, PostInviteResult, WithdrawResult } from "@/lib/server/plans";

type Failed = { ok: false; error: string };

export type JoinAnswer = JoinResult | SessionEnded | Failed;
export type WithdrawAnswer = WithdrawResult | SessionEnded | Failed;
export type ReportAnswer = CreateReportResult | SessionEnded | Failed;
export type PlanAnswer = PlanActionResult | SessionEnded | Failed;
export type PostAnswer = PostInviteResult | SessionEnded | Failed;

/**
 * Paid plans (stage 3: Stripe Connect). Nothing in this stage takes money, so the real pages have none of these
 * and never draw a plan with a cost (the server sends none while MEMBERS_PAID_PLANS_LIVE is off). The preview
 * harness passes example ones so the approved pay and leave sheets can still be looked at.
 */
export type PaidPlanStandIns = {
  paid: (invite: OpenInvite, me: InviteMember, nowIso: string, pence?: number) => OpenInvite;
  left: (invite: OpenInvite, me: InviteMember, refund: boolean, nowIso: string) => OpenInvite;
  askedForRefund: (invite: OpenInvite, nowIso: string) => OpenInvite;
};

export type InviteActions = {
  join: (planId: string) => Promise<JoinAnswer>;
  withdraw: (planId: string) => Promise<WithdrawAnswer>;
  /** The report sheet's reason, as its label ("Not a real plan") or its id. */
  report: (planId: string, reason: string) => Promise<ReportAnswer>;
  cancel: (planId: string) => Promise<PlanAnswer>;
  post: (input: NewOpenInvite) => Promise<PostAnswer>;
  edit: (planId: string, input: NewOpenInvite) => Promise<PlanAnswer>;
  /** Preview harness only: show the next page in place instead of going to its route ("Posted.", or the plan after an edit). */
  shown?: (next: { page: "posted" | "plan"; invite: OpenInvite }) => void;
  paid?: PaidPlanStandIns;
};

export const LIVE_INVITE_ACTIONS: InviteActions = {
  join: joinOpenInvite,
  withdraw: withdrawFromOpenInvite,
  report: reportOpenInvite,
  cancel: cancelOpenInvite,
  post: postOpenInvite,
  edit: editOpenInvite,
};

/** When an action could not even be called (the network dropped): the server's own words for a failure. */
export const TRY_AGAIN = "That didn’t go through. Try again in a moment.";

export const InviteActionsContext = createContext<InviteActions>(LIVE_INVITE_ACTIONS);

/** The actions for this screen: the real server actions, or the preview harness's stand-ins. */
export function useInviteActions(): InviteActions {
  return useContext(InviteActionsContext);
}
