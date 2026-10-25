// The Open Invite card: the public site's yellow invite card (2px ink border,
// hard shadow) with a feed's footer of two 44px buttons. Kit counterpart:
// pages_oi.oi_card(). One component for every state the design draws:
//
//   open      Open Invite   I'm in / Ask Tom           (paid: Pay £22 and join)
//   pending   Open Invite   Joining… / Ask Tom         (client only: full ink, same width, RULE-22)
//   in        You're in     Open chat (badge) / Details
//   full      Full          Full (outlined, muted) / Ask Tom
//   own       Your invite   Manage / Questions (badge)  (on Yours: the questions inside the card)
//   cancelled Cancelled     no buttons, muted card
//   past      Past          no buttons, muted card
//   posted    Your invite   See my invite / Post another (after posting)
//
// A plan with a cost adds a Cost row with a pill ("£22 each", "Paid £22",
// "Refunded £22") and, on your own paid plan, a money line ("1 paid, £40").
// The whole card is one tap target: the title link stretches over it and the
// buttons sit above.

import type { ReactNode } from "react";

import { Avatar, Button, Icon, KitLink, Pill } from "@/components/members/kit";
import {
  cardLabel,
  formatWhen,
  goingText,
  gbp,
  isPaid,
  planState,
  priceEach,
  type PlanState,
} from "@/lib/members/invite/format";
import type { InviteMember, OpenInvite } from "@/lib/members/invite/types";
import { messageThreadHref, openInviteHref, ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";

export type CardMode = "feed" | "posted";

function countText(n: number): string {
  return n < 10 ? String(n) : "9+";
}

// A value breaks only after a comma, never inside a short name (the public
// card's rule). A part longer than 24 characters may wrap.
export function CommaBreaks({ text }: { text: string }) {
  const parts = text.split(", ");
  return (
    <>
      {parts.map((part, index) => {
        const last = index === parts.length - 1;
        const value = last ? part : `${part},`;
        return (
          <span key={index}>
            {index > 0 ? " " : null}
            {part.length <= 24 ? <span className="mk-nb">{value}</span> : value}
          </span>
        );
      })}
    </>
  );
}

export function CountBadge({ n }: { n: number }) {
  return <span className="mk-badge">{countText(n)}</span>;
}

export function CountChip({ n }: { n: number }) {
  return <span className="oi-n">{countText(n)}</span>;
}

// Overlapping member photos (28px), in the order they said yes. Three show on
// a phone and two on a very narrow one (CSS).
function Going({ invite, full }: { invite: OpenInvite; full: boolean }) {
  const people = invite.going;
  if (people.length === 0 && !full) {
    return (
      <span className="oi-going">
        <span className="oi-gtx">
          <b>{invite.places} places</b> open
        </span>
      </span>
    );
  }
  const shown = people.slice(0, 5);
  const extra = people.length - shown.length;
  const text = goingText(invite);
  const [count, rest] = [text.slice(0, text.indexOf(" going")), "going"];
  return (
    <span className="oi-going">
      <span className="mk-avatars" aria-hidden="true">
        {shown.map((person, index) => (
          <Avatar
            key={person.id}
            photoUrl={person.photoUrl}
            name={person.firstName}
            size={28}
            tone={index % 2 ? "cream" : "pale"}
          />
        ))}
        {extra > 0 ? <span className="mk-more">+{extra}</span> : null}
      </span>
      <span className="oi-gtx">
        <b>{count}</b> {rest}
      </span>
    </span>
  );
}

export const STATE_PILLS: Record<PlanState, { text: string; kind: "ink" | "outline" | "muted" }> = {
  open: { text: "Open Invite", kind: "ink" },
  in: { text: "You’re in", kind: "ink" },
  full: { text: "Full", kind: "outline" },
  own: { text: "Your invite", kind: "ink" },
  past: { text: "Past", kind: "muted" },
  cancelled: { text: "Cancelled", kind: "muted" },
};

/** The host's one-line money note on their own paid plan: "1 paid, £40". */
export function hostMoneyLine(invite: OpenInvite): string | null {
  const money = invite.you.hostMoney;
  if (!money) return null;
  const paid = money.payments.filter((p) => p.status !== "refunded");
  if (paid.length === 0) return null;
  const total = paid.reduce((sum, p) => sum + p.amountPence, 0);
  return `${paid.length} paid, ${gbp(total)}`;
}

function CostPill({ invite, state }: { invite: OpenInvite; state: PlanState }) {
  if (!invite.cost) return null;
  const amount = gbp(invite.cost.pricePence);
  const payment = invite.you.payment;
  if (state === "in" && payment) return <Pill kind="ink">Paid {amount}</Pill>;
  if (state === "cancelled" && payment?.status === "refunded") return <Pill kind="muted">Refunded {amount}</Pill>;
  if (state === "past" || state === "cancelled") return <Pill kind="muted">{priceEach(invite.cost.pricePence)}</Pill>;
  return <Pill>{priceEach(invite.cost.pricePence)}</Pill>;
}

function Question({ question }: { question: OpenInvite["you"]["questions"][number] }) {
  return (
    <KitLink className="oi-q" href={messageThreadHref(question.threadId)}>
      <Avatar photoUrl={question.from.photoUrl} name={question.from.firstName} size={40} />
      <span className="bd">
        <b>{question.from.firstName}</b>
        <span>{question.text}</span>
      </span>
      <CountChip n={question.unread} />
    </KitLink>
  );
}

export function InviteCard({
  invite,
  me,
  mode = "feed",
  pending = false,
  withQuestions = false,
  placeholders,
  onJoin,
}: {
  invite: OpenInvite;
  /** The signed-in member: shown as "You" on their own plan. */
  me: InviteMember;
  mode?: CardMode;
  /** "Joining…": the join button is working. */
  pending?: boolean;
  /** Your own plan on Yours: the people who asked sit inside the card. */
  withQuestions?: boolean;
  /** The post form's live preview: words that stand in (muted) for what is not filled in yet. */
  placeholders?: { title?: string; when?: string; where?: string };
  /** I'm in (free) or Pay and join (paid). */
  onJoin?: (invite: OpenInvite) => void;
}) {
  const state = planState(invite);
  const host = invite.host;
  const mine = state === "own" || mode === "posted";
  const paid = isPaid(invite);
  const pill = STATE_PILLS[state];
  const poster = mine ? me : host;
  const dim = state === "past" || state === "cancelled";
  const href = openInviteHref(invite.id);
  const askName = host.firstName.length <= 10 ? `Ask ${host.firstName}` : "Ask";
  const unreadChat = invite.you.unreadInChat;
  const questions = invite.you.questions;
  const moneyLine = state === "own" ? hostMoneyLine(invite) : null;
  const join = invite.cost ? `Pay ${gbp(invite.cost.pricePence)} and join` : "I’m in";

  const ask = invite.you.askThreadId ? (
    <Button
      size="sm"
      variant="outline"
      href={messageThreadHref(invite.you.askThreadId)}
      className="oi-ask"
      aria-label={`Ask ${host.firstName} a question`}
      icon={<Icon name="message" size={18} />}
    >
      <span className="mk-lb">{askName}</span>
    </Button>
  ) : null;

  let actions: ReactNode = null;
  let wide = false;
  if (mode === "posted") {
    actions = (
      <>
        <Button size="sm" href={href}>
          <span className="mk-lb">See my invite</span>
        </Button>
        <Button size="sm" variant="outline" href={ROUTES.openInviteNew}>
          <span className="mk-lb">Post another</span>
        </Button>
      </>
    );
  } else if (state === "open") {
    wide = paid;
    actions = (
      <>
        <Button size="sm" pending={pending} onClick={pending ? undefined : () => onJoin?.(invite)}>
          <span className="mk-lb">{pending ? "Joining…" : join}</span>
        </Button>
        {ask}
      </>
    );
  } else if (state === "in") {
    actions = (
      <>
        <Button
          size="sm"
          href={invite.you.chatId ? messageThreadHref(invite.you.chatId) : href}
          icon={<Icon name="message" size={18} />}
        >
          <span className="mk-lb">Open chat</span>
          {unreadChat > 0 ? <CountBadge n={unreadChat} /> : null}
        </Button>
        <Button size="sm" variant="outline" href={href}>
          <span className="mk-lb">Details</span>
        </Button>
      </>
    );
  } else if (state === "full") {
    actions = (
      <>
        <Button size="sm" variant="outline" disabled>
          <span className="mk-lb">Full</span>
        </Button>
        {ask}
      </>
    );
  } else if (state === "own") {
    actions = withQuestions ? (
      <Button size="sm" href={href}>
        <span className="mk-lb">Manage</span>
      </Button>
    ) : (
      <>
        <Button size="sm" href={href}>
          <span className="mk-lb">Manage</span>
        </Button>
        <Button size="sm" variant="outline" href={href}>
          <span className="mk-lb">Questions</span>
          {questions.length > 0 ? <CountBadge n={questions.length} /> : null}
        </Button>
      </>
    );
  }

  return (
    <article
      className={cn("mk-invite oi-card", dim && "is-past", paid && "is-paid")}
      aria-label={cardLabel(invite, state)}
      data-state={pending ? "pending" : state}
    >
      <div className="oi-top-row">
        <Pill kind={pill.kind === "outline" ? undefined : pill.kind}>{pill.text}</Pill>
        {state !== "cancelled" ? <Going invite={invite} full={state === "full"} /> : null}
      </div>
      <h3>
        <KitLink href={href}>
          {placeholders?.title ? <span className="oi-ph">{placeholders.title}</span> : invite.title}
        </KitLink>
      </h3>
      <dl>
        <dt>When</dt>
        <dd>{placeholders?.when ? <span className="oi-ph">{placeholders.when}</span> : formatWhen(invite.startsAt)}</dd>
        <dt>Where</dt>
        <dd>
          {placeholders?.where ? <span className="oi-ph">{placeholders.where}</span> : <CommaBreaks text={invite.where} />}
        </dd>
        {paid ? (
          <>
            <dt>Cost</dt>
            <dd>
              <CostPill invite={invite} state={state} />
            </dd>
          </>
        ) : null}
        <dt>Posted by</dt>
        <dd>
          <span className="oi-by">
            <Avatar photoUrl={poster.photoUrl} name={poster.firstName} size={22} />
            <span className="oi-ell">{mine ? "You" : poster.firstName}</span>
          </span>
        </dd>
      </dl>
      {moneyLine ? (
        <p className="oi-moneyline">
          <Icon name="banknote" size={18} />
          <span>{moneyLine}</span>
        </p>
      ) : null}
      {withQuestions && state === "own" && questions.length > 0 ? (
        <div className="oi-qs">
          <div className="hd">
            <span>Questions</span>
            <span>{questions.length} new</span>
          </div>
          {questions.map((question) => (
            <Question key={question.threadId} question={question} />
          ))}
        </div>
      ) : null}
      {actions ? (
        <div className={cn("oi-actions", wide && "oi-wide", withQuestions && state === "own" && "oi-one")}>{actions}</div>
      ) : null}
    </article>
  );
}
