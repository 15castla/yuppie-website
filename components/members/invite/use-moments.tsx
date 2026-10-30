"use client";

// The "moments" a plan goes through while a member is on a page: joining, withdrawing, reporting, and the
// host's cancel. One hook for the browse page, Yours and the plan page, so they behave the same. It holds the
// plans (so a join flips a card to "You're in" at once) and the sheet that is open.
//
// Every step is a server action (./invite-actions.ts): the server answers with the plan as it is now, and the
// hook draws that. "I'm in" takes the place under the plan's row lock: when two members want the last place,
// one gets it and the other gets "full", the TakenSheet. The action also refreshes the page (revalidatePath),
// and fresh plans from the server replace what the hook holds.
//
// Paid plans (stage 3) never reach a real page in this stage; their sheets run on the preview harness's
// stand-ins only (actions.paid).

import { useState, type ReactNode } from "react";

import {
  AskedSheet,
  LeftSheet,
  PaidCancelledSheet,
  PaidCancelSheet,
  PaidLeaveSheet,
} from "@/components/members/payments/leave-sheets";
import { PaySheet, type PayState } from "@/components/members/payments/pay-sheet";
import { goToSessionEnded, isSessionEnded } from "@/components/members/session-ended";
import { leaveWindow } from "@/lib/members/invite/format";
import type { InviteMember, OpenInvite } from "@/lib/members/invite/types";
import { TRY_AGAIN, useInviteActions } from "./invite-actions";
import {
  CancelledSheet,
  CancelSheet,
  JoinedSheet,
  RefusedSheet,
  ReportSentSheet,
  ReportSheet,
  TakenSheet,
  WithdrawSheet,
} from "./moments";

/** Which sheet is open. `id` is the plan it is about. */
export type Moment =
  | { kind: "joined"; id: string }
  | { kind: "taken"; id: string }
  | { kind: "withdraw"; id: string }
  | { kind: "report"; id: string }
  | { kind: "report-sent"; id: string }
  | { kind: "cancel"; id: string }
  | { kind: "cancelled"; id: string }
  /** The server said no: its words. `gone`: the member may not see the plan any more (removed, a block). */
  | { kind: "refused"; id: string; message: string; gone?: boolean }
  // paid plans (the preview harness only in this stage): Pay and join, and the leave and refund sheets
  | { kind: "pay"; id: string; state?: PayState; newPricePence?: number }
  | { kind: "leave"; id: string; timing?: "full" | "late" }
  | { kind: "left"; id: string }
  | { kind: "asked"; id: string };

export type MomentsOptions = {
  /** The plans as the server sent them. Keep the same array while nothing new came from the server (useMemo). */
  plans: OpenInvite[];
  me: InviteMember;
  nowIso: string;
  /** Where "See other invites" goes. */
  seeOtherHref: string;
  /** The harness opens a screen with a sheet already up, or a card already "Joining…". */
  initialMoment?: Moment | null;
  initialPendingId?: string | null;
  /** flags.paidPlans: the report sheet lists "Price above what it cost". */
  paidPlans?: boolean;
  /** A plan the member may no longer see, once its sheet closes: the plan page leaves; a list drops the card (the default). */
  onGone?: (id: string) => void;
};

/** Call an action; a dropped connection reads as the server's plain failure. */
async function attempt<T>(run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await run();
  } catch (err) {
    // A redirect from the server (a paused member, the photo gate) is the router's to follow.
    if (err && typeof err === "object" && "digest" in err) throw err;
    return { ok: false, error: TRY_AGAIN };
  }
}

export function useMoments({
  plans: fromServer,
  me,
  nowIso,
  seeOtherHref,
  initialMoment = null,
  initialPendingId = null,
  paidPlans = false,
  onGone,
}: MomentsOptions) {
  const actions = useInviteActions();
  const [held, setHeld] = useState({ source: fromServer, plans: fromServer });
  const [moment, setMoment] = useState<Moment | null>(initialMoment);
  const [pendingId, setPendingId] = useState<string | null>(initialPendingId);
  const [busy, setBusy] = useState(false);

  // Fresh plans from the server (the action's refresh, a navigation) replace what this hook holds.
  let plans = held.plans;
  if (held.source !== fromServer) {
    plans = fromServer;
    setHeld({ source: fromServer, plans: fromServer });
  }

  function update(id: string, change: (plan: OpenInvite) => OpenInvite) {
    setHeld((current) => ({ ...current, plans: current.plans.map((plan) => (plan.id === id ? change(plan) : plan)) }));
  }
  const replace = (id: string, next: OpenInvite | null | undefined) => {
    if (next) update(id, () => next);
  };
  const drop = (id: string) => setHeld((current) => ({ ...current, plans: current.plans.filter((plan) => plan.id !== id) }));
  const refuse = (id: string, message: string, gone = false) => setMoment({ kind: "refused", id, message, gone });

  /** I'm in. A plan with a cost opens the pay sheet instead (the harness only: nothing is taken until Pay). */
  async function join(invite: OpenInvite) {
    if (pendingId) return;
    if (invite.cost && actions.paid) {
      setMoment({ kind: "pay", id: invite.id });
      return;
    }
    setPendingId(invite.id);
    try {
      const result = await attempt(() => actions.join(invite.id));
      if (isSessionEnded(result)) return goToSessionEnded();
      if (result.ok) {
        replace(invite.id, result.invite);
        setMoment({ kind: "joined", id: invite.id });
        return;
      }
      const reason = "reason" in result ? result.reason : null;
      const answered = "invite" in result ? result.invite : null;
      if (reason === "full") {
        // Someone got there first: the plan is full now (the card and the bar say so) and the sheet says why.
        replace(invite.id, answered);
        setMoment({ kind: "taken", id: invite.id });
        return;
      }
      if (reason === "not_found" || reason === "blocked") {
        // Gone (removed by the club, or a block): it stays on screen only until the sheet closes.
        refuse(invite.id, result.error, true);
        return;
      }
      replace(invite.id, answered);
      refuse(invite.id, result.error);
    } finally {
      setPendingId(null);
    }
  }

  async function run(id: string, call: () => Promise<{ ok: true; invite: OpenInvite } | { ok: false; error: string; invite?: OpenInvite | null } | { sessionEnded: true }>, then: Moment | null) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await attempt(call);
      if (isSessionEnded(result)) return goToSessionEnded();
      if (result.ok) {
        replace(id, result.invite);
        setMoment(then);
        return;
      }
      replace(id, "invite" in result ? result.invite : null);
      refuse(id, result.error);
    } finally {
      setBusy(false);
    }
  }

  async function report(id: string, reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await attempt(() => actions.report(id, reason));
      if (isSessionEnded(result)) return goToSessionEnded();
      if (result.ok) setMoment({ kind: "report-sent", id });
      else refuse(id, result.error);
    } finally {
      setBusy(false);
    }
  }

  const open = (kind: Moment["kind"], id: string) => setMoment({ kind, id } as Moment);
  const close = () => {
    if (moment?.kind === "refused" && moment.gone) (onGone ?? drop)(moment.id);
    setMoment(null);
  };

  const current = moment ? plans.find((plan) => plan.id === moment.id) : undefined;
  let sheet: ReactNode = null;
  if (moment && current) {
    switch (moment.kind) {
      case "joined":
        sheet = <JoinedSheet invite={current} me={me} onClose={close} />;
        break;
      case "taken":
        sheet = <TakenSheet invite={current} onClose={close} seeOtherHref={seeOtherHref} />;
        break;
      case "refused":
        sheet = <RefusedSheet message={moment.message} onClose={close} />;
        break;
      case "withdraw":
        sheet = (
          <WithdrawSheet
            invite={current}
            busy={busy}
            onClose={close}
            onConfirm={() => run(current.id, () => actions.withdraw(current.id), null)}
          />
        );
        break;
      case "report":
        sheet = (
          <ReportSheet
            invite={current}
            withPrice={paidPlans}
            busy={busy}
            onClose={close}
            onSend={(reason) => report(current.id, reason)}
          />
        );
        break;
      case "report-sent":
        sheet = <ReportSentSheet onClose={close} />;
        break;
      case "cancel": {
        const payers = (current.you.hostMoney?.payments ?? []).filter((payment) => payment.status !== "refunded");
        const confirm = () => run(current.id, () => actions.cancel(current.id), { kind: "cancelled", id: current.id });
        sheet =
          current.cost && payers.length > 0 ? (
            <PaidCancelSheet payers={payers} onClose={close} onConfirm={confirm} />
          ) : (
            <CancelSheet invite={current} busy={busy} onClose={close} onConfirm={confirm} />
          );
        break;
      }
      case "cancelled": {
        const refunded = current.you.hostMoney?.payments ?? [];
        sheet =
          current.cost && refunded.length > 0 ? (
            <PaidCancelledSheet payers={refunded} onClose={close} />
          ) : (
            <CancelledSheet invite={current} onClose={close} />
          );
        break;
      }
      // ---- paid plans: the preview harness's stand-ins (actions.paid); no real page reaches these in stage 2
      case "pay": {
        const paid = actions.paid;
        if (!paid) break;
        sheet = (
          <PaySheet
            invite={current}
            initialState={moment.state}
            newPricePence={moment.newPricePence}
            seeOtherHref={seeOtherHref}
            onClose={close}
            onPaid={(pence) => update(current.id, (plan) => paid.paid(plan, me, nowIso, pence))}
          />
        );
        break;
      }
      case "leave": {
        const paid = actions.paid;
        if (!paid) break;
        sheet = (
          <PaidLeaveSheet
            invite={current}
            timing={moment.timing ?? leaveWindow(current.startsAt, nowIso)}
            onClose={close}
            onLeave={(refund) => {
              update(current.id, (plan) => paid.left(plan, me, refund, nowIso));
              if (refund) setMoment({ kind: "left", id: current.id });
              else close();
            }}
            onAsk={() => {
              update(current.id, (plan) => paid.askedForRefund(plan, nowIso));
              setMoment({ kind: "asked", id: current.id });
            }}
          />
        );
        break;
      }
      case "left":
        sheet = <LeftSheet invite={current} onClose={close} />;
        break;
      case "asked":
        sheet = <AskedSheet invite={current} onClose={close} />;
        break;
    }
  }

  return { plans, update, pendingId, join, open, close, sheet, moment, busy };
}
