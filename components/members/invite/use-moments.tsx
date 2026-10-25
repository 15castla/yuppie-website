"use client";

// The "moments" a plan goes through while a member is on a page: joining,
// withdrawing, reporting. One hook for the browse page and the plan page, so
// they behave the same. It holds the plans (so a join flips a card to "You're
// in") and the sheet that is open.
//
// LOCAL DEMO STATE. There is no backend, so I'm in, withdraw and report only
// change what this browser tab shows (see demo-state.ts). With a backend each
// step becomes a server action that returns the new plan.

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  AskedSheet,
  LeftSheet,
  PaidCancelledSheet,
  PaidCancelSheet,
  PaidLeaveSheet,
} from "@/components/members/payments/leave-sheets";
import { PaySheet, type PayState } from "@/components/members/payments/pay-sheet";
import { leaveWindow } from "@/lib/members/invite/format";
import type { InviteMember, OpenInvite } from "@/lib/members/invite/types";
import { askedForRefund, cancelled, joinedFree, joinedPaid, left } from "./demo-state";
import {
  CancelledSheet,
  CancelSheet,
  JoinedSheet,
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
  // paid plans (the paid plans flag): Pay and join, and the leave and refund sheets
  | { kind: "pay"; id: string; state?: PayState; newPricePence?: number }
  | { kind: "leave"; id: string; timing?: "full" | "late" }
  | { kind: "left"; id: string }
  | { kind: "asked"; id: string };

/** How long "Joining…" shows before the plan says yes (the demo's stand-in for the server). */
export const JOIN_DELAY_MS = 900;

export type MomentsOptions = {
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
};

export function useMoments({
  plans: initialPlans,
  me,
  nowIso,
  seeOtherHref,
  initialMoment = null,
  initialPendingId = null,
  paidPlans = false,
}: MomentsOptions) {
  const [plans, setPlans] = useState(initialPlans);
  const [moment, setMoment] = useState<Moment | null>(initialMoment);
  const [pendingId, setPendingId] = useState<string | null>(initialPendingId);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(id: string, change: (plan: OpenInvite) => OpenInvite) {
    setPlans((list) => list.map((plan) => (plan.id === id ? change(plan) : plan)));
  }

  /** I'm in. A plan with a cost opens the pay sheet instead (nothing is taken until Pay). */
  function join(invite: OpenInvite) {
    if (pendingId) return;
    if (invite.cost) {
      setMoment({ kind: "pay", id: invite.id });
      return;
    }
    setPendingId(invite.id);
    timer.current = setTimeout(() => {
      update(invite.id, (plan) => joinedFree(plan, me));
      setPendingId(null);
      setMoment({ kind: "joined", id: invite.id });
    }, JOIN_DELAY_MS);
  }

  const open = (kind: Moment["kind"], id: string) => setMoment({ kind, id } as Moment);
  const close = () => setMoment(null);

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
      case "withdraw":
        sheet = (
          <WithdrawSheet
            invite={current}
            onClose={close}
            onConfirm={() => {
              update(current.id, (plan) => left(plan, me, false, nowIso));
              close();
            }}
          />
        );
        break;
      case "report":
        sheet = <ReportSheet invite={current} withPrice={paidPlans} onClose={close} onSend={() => setMoment({ kind: "report-sent", id: current.id })} />;
        break;
      case "report-sent":
        sheet = <ReportSentSheet onClose={close} />;
        break;
      case "cancel": {
        const payers = (current.you.hostMoney?.payments ?? []).filter((payment) => payment.status !== "refunded");
        const confirm = () => {
          update(current.id, (plan) => cancelled(plan, nowIso));
          setMoment({ kind: "cancelled", id: current.id });
        };
        sheet =
          current.cost && payers.length > 0 ? (
            <PaidCancelSheet payers={payers} onClose={close} onConfirm={confirm} />
          ) : (
            <CancelSheet invite={current} onClose={close} onConfirm={confirm} />
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
      case "pay":
        sheet = (
          <PaySheet
            invite={current}
            initialState={moment.state}
            newPricePence={moment.newPricePence}
            seeOtherHref={seeOtherHref}
            onClose={close}
            onPaid={(pence) => update(current.id, (plan) => joinedPaid(plan, me, nowIso, pence))}
          />
        );
        break;
      case "leave":
        sheet = (
          <PaidLeaveSheet
            invite={current}
            timing={moment.timing ?? leaveWindow(current.startsAt, nowIso)}
            onClose={close}
            onLeave={(refund) => {
              update(current.id, (plan) => left(plan, me, refund, nowIso));
              if (refund) setMoment({ kind: "left", id: current.id });
              else close();
            }}
            onAsk={() => {
              update(current.id, (plan) => askedForRefund(plan, nowIso));
              setMoment({ kind: "asked", id: current.id });
            }}
          />
        );
        break;
      case "left":
        sheet = <LeftSheet invite={current} onClose={close} />;
        break;
      case "asked":
        sheet = <AskedSheet invite={current} onClose={close} />;
        break;
    }
  }

  return { plans, update, pendingId, join, open, close, sheet, moment };
}
