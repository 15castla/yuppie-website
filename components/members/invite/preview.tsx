"use client";

// PREVIEW HARNESS ONLY (app/dev-preview/registry/invite.tsx): Open Invite's screens with stand-in actions, so
// their buttons can be pressed with no login and no database. EXAMPLE DATA: every answer is made up from the
// example plans the registry passes in, after a short wait; nothing is read, saved or sent. Never used by a live
// page: the real pages use the server actions (./invite-actions.ts LIVE_INVITE_ACTIONS).
//
// What the example "server" answers is ./preview-state.ts (plain functions, so the registry can call them on the
// server too). The paid-plan stand-ins are there as well: paid plans are stage 3, so the approved pay and leave
// sheets exist only in the harness.

import { useMemo, useRef, useState, type ReactNode } from "react";

import { londonLocalToIso, placesLeft } from "@/lib/members/invite/format";
import type { InviteMember, NewOpenInvite, OpenInvite } from "@/lib/members/invite/types";
import { InviteActionsContext, type InviteActions } from "./invite-actions";
import { PlanView } from "./plan-view";
import { PostedView } from "./post-view";
import { askedForRefund, cancelled, joinedFree, joinedPaid, left } from "./preview-state";

const wait = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms));
const DAY = 86_400_000;

/** A plan as the post form sends it, as the host would see it once posted (or edited). */
function fromInput(id: string, input: NewOpenInvite, me: InviteMember, base?: OpenInvite): OpenInvite {
  const guests = (base?.going ?? []).filter((person) => person.id !== me.id);
  return {
    id,
    title: input.title.trim(),
    type: input.type,
    startsAt: londonLocalToIso(input.date, input.time) ?? new Date(Date.now() + DAY).toISOString(),
    where: input.where.trim(),
    note: input.note.trim() === "" ? null : input.note.trim(),
    places: input.places,
    hostGoing: input.hostGoing,
    host: me,
    going: input.hostGoing ? [me, ...guests] : guests,
    status: "scheduled",
    cost: input.cost,
    you: {
      role: "host",
      chatId: `chat-${id}`,
      unreadInChat: 0,
      chatPreview: null,
      askThreadId: null,
      hostReply: null,
      questions: base?.you.questions ?? [],
      payment: null,
      hostMoney: base?.you.hostMoney ?? null,
      receiptEmail: "",
    },
  };
}

const NOT_FOUND = "That plan couldn’t be found.";

/**
 * Wrap a screen: its buttons answer from `plans` (a small example "server" that remembers what was pressed while
 * the page is open). After "Post Open Invite" the "Posted." page shows in place, and after "Save changes" the
 * plan, as the real routes would.
 */
export function InvitePreview({
  plans,
  me,
  now,
  children,
}: {
  plans: OpenInvite[];
  me: InviteMember;
  now: string;
  children: ReactNode;
}) {
  const store = useRef<Map<string, OpenInvite> | null>(null);
  const [shown, setShown] = useState<{ page: "posted" | "plan"; invite: OpenInvite } | null>(null);
  const actions = useMemo<InviteActions>(() => {
    const db = () => (store.current ??= new Map(plans.map((plan) => [plan.id, plan])));
    const keep = (plan: OpenInvite) => {
      db().set(plan.id, plan);
      return plan;
    };
    return {
      join: async (id) => {
        await wait();
        const plan = db().get(id);
        if (!plan) return { ok: false, reason: "not_found", error: NOT_FOUND, invite: null };
        if (placesLeft(plan) === 0) return { ok: false, reason: "full", error: "The last place has gone.", invite: plan };
        const next = keep(joinedFree(plan, me));
        return { ok: true, invite: next, chatId: next.you.chatId };
      },
      withdraw: async (id) => {
        await wait(600);
        const plan = db().get(id);
        if (!plan) return { ok: false, reason: "not_found", error: NOT_FOUND, invite: null };
        return { ok: true, invite: keep(left(plan, me, false, now)) };
      },
      report: async () => {
        await wait(600);
        return { ok: true, reportId: "example-report", duplicate: false };
      },
      cancel: async (id) => {
        await wait(600);
        const plan = db().get(id);
        if (!plan) return { ok: false, error: NOT_FOUND, invite: null };
        return { ok: true, invite: keep(cancelled(plan, now)) };
      },
      post: async (input) => {
        await wait();
        const invite = keep(fromInput(`example-${db().size + 1}`, input, me));
        return { ok: true, id: invite.id, invite };
      },
      edit: async (id, input) => {
        await wait(600);
        return { ok: true, invite: keep(fromInput(id, input, me, db().get(id))) };
      },
      shown: (next) => setShown(next),
      paid: { paid: joinedPaid, left, askedForRefund },
    };
  }, [plans, me, now]);
  return (
    <InviteActionsContext.Provider value={actions}>
      {shown?.page === "posted" ? (
        <PostedView invite={shown.invite} me={me} />
      ) : shown?.page === "plan" ? (
        <PlanView page={{ invite: shown.invite, me, now }} paidPlans={false} />
      ) : (
        children
      )}
    </InviteActionsContext.Provider>
  );
}
