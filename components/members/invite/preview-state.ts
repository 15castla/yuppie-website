// PREVIEW HARNESS ONLY (./preview.tsx and app/dev-preview/registry/invite.tsx). EXAMPLE DATA: the plan as an
// example "server" would answer after I'm in, Pay and join, leave or cancel, made from the example plans in
// lib/members/mock/open-invite.ts. Nothing is read, saved or sent. Plain functions (not a client module), so the
// registry can call them on the server. Never used by a live page: the real answers are lib/server/plans.ts's.

import type { InviteMember, InvitePayment, OpenInvite } from "@/lib/members/invite/types";

const DAY = 86_400_000;

export function joinedFree(invite: OpenInvite, me: InviteMember): OpenInvite {
  return {
    ...invite,
    going: [...invite.going, me],
    you: { ...invite.you, role: "going", chatId: `chat-${invite.id}`, askThreadId: null, unreadInChat: 0, chatPreview: null },
  };
}

function examplePayment(invite: OpenInvite, me: InviteMember, nowIso: string, pence?: number): InvitePayment {
  return {
    id: `pay-${invite.id}`,
    receiptNumber: "0417",
    inviteId: invite.id,
    payer: me,
    amountPence: pence ?? invite.cost?.pricePence ?? 0,
    paidAt: nowIso,
    method: "Visa ending 4242",
    status: "held",
    refundAskedAt: null,
    refund: null,
  };
}

export function joinedPaid(invite: OpenInvite, me: InviteMember, nowIso: string, pence?: number): OpenInvite {
  const joined = joinedFree(invite, me);
  return { ...joined, you: { ...joined.you, payment: examplePayment(invite, me, nowIso, pence) } };
}

/** The member asked the host for a refund inside 24 hours: they stay in until the host answers. */
export function askedForRefund(invite: OpenInvite, nowIso: string): OpenInvite {
  const payment = invite.you.payment;
  if (!payment) return invite;
  return { ...invite, you: { ...invite.you, payment: { ...payment, status: "refund-asked", refundAskedAt: nowIso } } };
}

/** The member left. A paid plan's payment is refunded (in full, automatic) when `refund` is true. */
export function left(invite: OpenInvite, me: InviteMember, refund: boolean, nowIso: string): OpenInvite {
  const payment = invite.you.payment;
  const refunded: InvitePayment | null =
    payment && refund
      ? {
          ...payment,
          status: "refunded",
          refund: {
            amountPence: payment.amountPence,
            reason: "left-in-time",
            refundedAt: nowIso,
            expectedBy: new Date(new Date(nowIso).getTime() + 14 * DAY).toISOString(),
          },
        }
      : null;
  return {
    ...invite,
    going: invite.going.filter((person) => person.id !== me.id),
    you: { ...invite.you, role: "guest", chatId: null, unreadInChat: 0, chatPreview: null, askThreadId: `ask-${invite.id}`, payment: refunded },
  };
}

/** The host cancelled. Everyone who paid is refunded. */
export function cancelled(invite: OpenInvite, nowIso: string): OpenInvite {
  const money = invite.you.hostMoney;
  return {
    ...invite,
    status: "cancelled",
    you: {
      ...invite.you,
      hostMoney: money
        ? {
            ...money,
            payoutOn: null,
            payments: money.payments.map((payment) => ({
              ...payment,
              status: "refunded" as const,
              refund: {
                amountPence: payment.amountPence,
                reason: "host-cancelled" as const,
                refundedAt: nowIso,
                expectedBy: new Date(new Date(nowIso).getTime() + 14 * DAY).toISOString(),
              },
            })),
          }
        : null,
    },
  };
}
