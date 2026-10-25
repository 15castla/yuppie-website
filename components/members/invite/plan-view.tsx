"use client";

// Open Invite > a plan. Kit counterpart: pages_oi.invite_page(). Enough to
// decide, one action. On a phone: back row (with the messages icon), hero
// (pills, title, facts, the trainer on the hero's rule), a cream band (money
// lines on a paid plan, the poster's note, Who's in), a yellow tail (message
// row, safety line, links) and a docked action bar in the tab bar's slot. On a
// computer the bar becomes an action card beside the title.
//
// States (planState): open, in, full, own, cancelled, past. A plan with a cost
// adds the Cost line, the money lines and "Pay £22 and join". A pure view of
// OpenInvitePage: the harness renders it without a login or a database.

import "./invite.css";

import type { ReactNode } from "react";

import { Avatar, BackRow, Button, Icon, KitLink, Main, Pill, Row, Rows, Shape, Status } from "@/components/members/kit";
import {
  formatWhen,
  gbp,
  goingText,
  isPaid,
  placesLeft,
  placesLeftText,
  planState,
  type PlanState,
} from "@/lib/members/invite/format";
import type { InviteMember, OpenInvite, OpenInvitePage } from "@/lib/members/invite/types";
import { messageThreadHref, openInviteReceiptHref, ROUTES } from "@/lib/members/routes";
import { InkDrawing } from "./ink-drawing";
import { CommaBreaks, CountBadge, CountChip, hostMoneyLine, STATE_PILLS } from "./invite-card";
import { BarMessages } from "./top-block";
import { useMoments, type Moment } from "./use-moments";

// ---------------------------------------------------------------- pieces

function MessageTile() {
  return (
    <span className="mk-icon-tile">
      <Icon name="message" size={22} />
    </span>
  );
}

function PlanRow({
  href,
  leading,
  title,
  meta,
  end,
}: {
  href: string;
  leading: ReactNode;
  title: string;
  meta: string;
  end?: ReactNode;
}) {
  return (
    <Row
      href={href}
      leading={leading}
      title={title}
      meta={meta}
      className="oi-row"
      end={
        <>
          {end}
          <Icon name="chevron-right" size={22} />
        </>
      }
    />
  );
}

function ActionBar({ lead, sub, children }: { lead: string; sub: string; children: ReactNode }) {
  return (
    <div className="mk-dock" data-needs-device-check="true">
      <div className="mk-tabbar oi-bar" role="group" aria-label="This plan">
        <div className="pr">
          <b>{lead}</b>
          <span>{sub}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The two money lines for a member looking at a paid plan: where the money is, then the refund rule. */
export function moneyLines(invite: OpenInvite, state: PlanState): { first: ReactNode; second: string } {
  const poster = invite.host.firstName;
  const amount = gbp(invite.cost?.pricePence ?? 0);
  return {
    first: (
      <>
        Your <b>{amount}</b> is held by Club&nbsp;Yuppie until the plan is over. Then it goes to {poster}.
      </>
    ),
    second:
      state === "in"
        ? `Leave up to 24 hours before for a full refund. Later than that, ask ${poster}.`
        : `Leave up to 24 hours before for a full refund. ${poster} says the price is no more than it cost.`,
  };
}

function MoneyTile({ invite, state }: { invite: OpenInvite; state: PlanState }) {
  const { first, second } = moneyLines(invite, state);
  return (
    <div className="oi-sec mk-show-phone">
      <div className="mk-tile oi-money">
        <span className="oi-money-ic">
          <Icon name="banknote" size={22} />
        </span>
        <div className="bd">
          <p className="l1">{first}</p>
          <p className="l2">{second}</p>
          {state === "in" && invite.you.payment ? (
            <KitLink className="mk-link oi-rc" href={openInviteReceiptHref(invite.id)}>
              See receipt
            </KitLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const GET_PAID_LINE = {
  "not-set-up": { text: "Get paid is not set up", tone: "warn" },
  "needs-info": { text: "Get paid needs more info", tone: "warn" },
  "in-review": { text: "Get paid is in review", tone: "warn" },
  ready: { text: "Get paid is ready", tone: "ok" },
} as const;

/** The host's Money block on their own paid plan. */
function MoneyOwn({ invite }: { invite: OpenInvite }) {
  const money = invite.you.hostMoney;
  if (!money) return null;
  const paid = money.payments.filter((payment) => payment.status !== "refunded");
  const total = paid.reduce((sum, payment) => sum + payment.amountPence, 0);
  const line = GET_PAID_LINE[money.getPaid];
  return (
    <div className="oi-sec">
      <div className="mk-sh">
        <h2 className="mk-h2">Money</h2>
        <span className="oi-meta">{paid.length} paid</span>
      </div>
      <div className="mk-tile oi-money own">
        <p className="l1">
          {paid.length > 0 ? (
            <>
              <b>
                {paid.length} paid, {gbp(total)}.
              </b>{" "}
              Paid out about 2 days after the plan.
            </>
          ) : (
            "Nobody has paid yet. Paid out about 2 days after the plan."
          )}
        </p>
        {paid.length > 0 ? (
          <div className="oi-pays">
            {paid.map((payment) => (
              <div className="oi-pay" key={payment.id}>
                <Avatar photoUrl={payment.payer.photoUrl} name={payment.payer.firstName} size={40} />
                <b>{payment.payer.firstName}</b>
                <span>Paid {gbp(payment.amountPence)}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="oi-gpline">
          <Status tone={line.tone}>{line.text}</Status>
          <KitLink className="mk-link" href={ROUTES.youPayments}>
            Money details
          </KitLink>
        </div>
      </div>
    </div>
  );
}

function Person({ person, label }: { person: InviteMember; label: string }) {
  return (
    <div className="oi-person">
      <Avatar photoUrl={person.photoUrl} name={person.firstName} size={64} />
      <b title={person.firstName}>{person.firstName}</b>
      <small>{label}</small>
    </div>
  );
}

/** Who's in: 64px photos and first names, open places as dashed circles. */
function WhoGrid({ invite, me }: { invite: OpenInvite; me: InviteMember }) {
  const cap = 8;
  const mine = invite.you.role === "host";
  const paidIds = new Set(
    (invite.you.hostMoney?.payments ?? []).filter((payment) => payment.status !== "refunded").map((payment) => payment.payer.id),
  );
  const shown = invite.going.slice(0, cap);
  const left = placesLeft(invite);
  const room = Math.max(cap - invite.going.length, 0);
  const seats = Math.min(left, room);
  return (
    <div className="oi-who">
      {shown.map((person) => {
        let label = "";
        if (person.id === me.id) label = mine ? "You, poster" : "You";
        else if (person.id === invite.host.id) label = "Poster";
        else if (mine && isPaid(invite) && paidIds.has(person.id)) label = "Paid";
        return <Person key={person.id} person={person} label={label} />;
      })}
      {Array.from({ length: seats }, (_, index) => {
        const last = index === seats - 1 && left > seats;
        return (
          <div className="oi-person" key={`seat-${index}`}>
            <span className="oi-seat-l" aria-hidden="true">
              {last ? `+${left - seats + 1}` : ""}
            </span>
            <b className="oi-quiet oi-light">{last ? "more" : "Open"}</b>
            <small />
          </div>
        );
      })}
    </div>
  );
}

function Note({ invite, mine, className }: { invite: OpenInvite; mine: boolean; className: string }) {
  if (!invite.note) return null;
  return (
    <div className={`oi-sec ${className}`}>
      <div className="mk-tile oi-note">
        <div className="mk-who">
          <span>{mine ? "Your note" : `Note from ${invite.host.firstName}`}</span>
        </div>
        <p>{invite.note}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the page

export function PlanView({
  page,
  paidPlans,
  initialMoment = null,
  initialPendingId = null,
}: {
  page: OpenInvitePage;
  /** flags.paidPlans. A plan with a cost is only drawn when it is on (the route 404s otherwise). */
  paidPlans: boolean;
  initialMoment?: Moment | null;
  initialPendingId?: string | null;
}) {
  const { me, now } = page;
  const moments = useMoments({
    plans: [page.invite],
    me,
    nowIso: now,
    seeOtherHref: ROUTES.openInvite,
    initialMoment,
    initialPendingId,
  });
  const invite = moments.plans[0];
  const pending = moments.pendingId === invite.id;
  const state = planState(invite);
  const host = invite.host;
  const poster = host.firstName;
  const mine = state === "own";
  const dead = state === "cancelled" || state === "past";
  const paid = paidPlans && isPaid(invite);
  const amount = invite.cost ? gbp(invite.cost.pricePence) : "";
  const payment = invite.you.payment;
  const left = placesLeftText(invite);
  const going = goingText(invite);
  const askHref = invite.you.askThreadId ? messageThreadHref(invite.you.askThreadId) : null;
  const chatHref = invite.you.chatId ? messageThreadHref(invite.you.chatId) : ROUTES.messages;
  const unread = invite.you.unreadInChat;
  const moneyLine = hostMoneyLine(invite);
  const refunded = payment?.status === "refunded";

  // ---- pills
  const first = STATE_PILLS[state];
  const firstText = paid && state === "in" && payment ? `You’re in, paid ${amount}` : first.text;
  const pills = (
    <>
      <Pill kind={first.kind === "outline" ? undefined : first.kind}>{firstText}</Pill>
      {!dead && state !== "full" ? <Pill>{left}</Pill> : null}
      {paid && state === "cancelled" && refunded ? <Pill kind="muted">Refunded {amount}</Pill> : null}
    </>
  );

  // ---- notice
  let notice: ReactNode = null;
  if (state === "cancelled") {
    if (mine) {
      notice = (
        <div className="oi-notice">
          <Icon name="info" size={20} />
          <div>
            <b>You cancelled this invite.</b>{" "}
            {paid ? "Everyone who paid was refunded in full." : "Everyone who was in has been told."}
          </div>
        </div>
      );
    } else if (paid && payment) {
      notice = (
        <div className="oi-notice">
          <Icon name="banknote" size={20} />
          <div>
            <b>{poster} cancelled this plan.</b> {amount} refunded to your card, back in 5 to 10 working days.
          </div>
        </div>
      );
    } else {
      notice = (
        <div className="oi-notice">
          <Icon name="info" size={20} />
          <div>
            <b>{poster} cancelled this invite.</b> Nothing to do. There are more plans to browse.
          </div>
        </div>
      );
    }
  } else if (state === "past") {
    notice = (
      <div className="oi-notice">
        <Icon name="clock" size={20} />
        <div>
          <b>This plan has finished.</b> The plan chat is closed. You can still read it.
        </div>
      </div>
    );
  } else if (state === "full") {
    notice = (
      <div className="oi-notice">
        <Icon name="info" size={20} />
        <div>
          <b>All places are taken.</b> You can still ask {poster} a question.
        </div>
      </div>
    );
  }

  // ---- facts
  const facts = (
    <dl className="oi-facts">
      <dt>When</dt>
      <dd>{formatWhen(invite.startsAt)}</dd>
      <dt>Where</dt>
      <dd>
        <CommaBreaks text={invite.where} />
      </dd>
      {paid ? (
        <>
          <dt>Cost</dt>
          <dd className="oi-priceline">
            <b>{amount}</b> each
          </dd>
        </>
      ) : null}
      <dt className="oi-host-dt">Posted by</dt>
      <dd className="oi-host">
        <Avatar photoUrl={(mine ? me : host).photoUrl} name={(mine ? me : host).firstName} size={44} />
        <span className="oi-ell" title={poster}>
          {mine ? "You" : poster}
        </span>
      </dd>
    </dl>
  );

  // ---- the primary control: the phone's docked bar and the desktop card say the same thing
  const joinLabel = paid ? `Pay ${amount} and join` : "I’m in";
  let barLead = left;
  let barSub = going;
  let barButton: ReactNode;
  let cardButton: ReactNode;
  const chatLabel = (
    <>
      Open chat
      {unread > 0 ? <CountBadge n={unread} /> : null}
    </>
  );
  switch (state) {
    case "open":
      barButton = (
        <Button pending={pending} onClick={pending ? undefined : () => moments.join(invite)}>
          {pending ? "Joining…" : joinLabel}
        </Button>
      );
      cardButton = barButton;
      break;
    case "in":
      barLead = "You’re in";
      barSub = paid && payment ? `Paid ${gbp(payment.amountPence)}` : left;
      barButton = (
        <Button href={chatHref} icon={<Icon name="message" size={20} />}>
          {chatLabel}
        </Button>
      );
      cardButton = barButton;
      break;
    case "full":
      barLead = "Full";
      barButton = (
        <Button disabled variant="outline">
          Full
        </Button>
      );
      cardButton = barButton;
      break;
    case "own":
      barSub = paid ? (moneyLine ?? going) : going;
      barButton = (
        <Button href={`${ROUTES.openInvite}/${encodeURIComponent(invite.id)}`} icon={<Icon name="pencil" size={20} />}>
          Edit invite
        </Button>
      );
      cardButton = barButton;
      break;
    case "cancelled":
      barLead = "Cancelled";
      barSub = paid && payment && refunded ? `${amount} refunded` : "Not happening";
      barButton = <Button href={ROUTES.openInvite}>See invites</Button>;
      cardButton = <Button href={ROUTES.openInvite}>See Open Invites</Button>;
      break;
    case "past":
      barLead = "Finished";
      barSub = formatWhen(invite.startsAt).split(",")[0];
      barButton = <Button href={ROUTES.openInvite}>See invites</Button>;
      cardButton = <Button href={ROUTES.openInvite}>See Open Invites</Button>;
      break;
  }

  // ---- desktop action card
  const questions = invite.you.questions;
  let secondary: ReactNode = null;
  if ((state === "open" || state === "full") && askHref) {
    secondary = (
      <Button variant="outline" href={askHref} icon={<Icon name="message" size={20} />}>
        Ask {poster.split(" ")[0]}
      </Button>
    );
  } else if (state === "own") {
    secondary = (
      <Button variant="outline" href="#questions">
        Questions
        {questions.length > 0 ? <CountBadge n={questions.length} /> : null}
      </Button>
    );
  }
  const withdraw =
    state === "in" ? (
      <Button variant="quiet" danger onClick={() => moments.open(paid ? "leave" : "withdraw", invite.id)}>
        Withdraw from this plan
      </Button>
    ) : null;
  const cancel =
    state === "own" ? (
      <Button variant="quiet" danger onClick={() => moments.open("cancel", invite.id)}>
        Cancel this invite
      </Button>
    ) : null;
  const report =
    state === "open" || state === "full" || state === "in" ? (
      <Button variant="quiet" className="quiet" icon={<Icon name="flag" size={18} />} onClick={() => moments.open("report", invite.id)}>
        Report this invite
      </Button>
    ) : null;

  const lines = paid && (state === "open" || state === "in") ? moneyLines(invite, state) : null;
  const card = (
    <div className="oi-hero-side mk-show-desk">
      <div className="oi-act-art">
        <InkDrawing name="trainer" w={152} line={2.5} />
      </div>
      <div className="oi-act">
        <div className="big">{barLead}</div>
        <div className="mk-sub">{barSub}</div>
        {cardButton}
        {secondary}
        {lines ? (
          <p className="oi-act-money">
            {lines.first} {lines.second}
          </p>
        ) : null}
        {withdraw || cancel ? <hr /> : null}
        <div className="oi-links">
          {withdraw}
          {cancel}
        </div>
      </div>
    </div>
  );

  // ---- message rows (ask, chat, questions)
  let rows: ReactNode = null;
  if (state === "open" || state === "full") {
    if (askHref) {
      rows = invite.you.hostReply ? (
        <PlanRow
          href={askHref}
          leading={<MessageTile />}
          title={`Your question to ${poster}`}
          meta={`${poster}: ${invite.you.hostReply}`}
        />
      ) : (
        <PlanRow href={askHref} leading={<MessageTile />} title={`Ask ${poster.split(" ")[0]}`} meta="A private question before you decide." />
      );
    }
  } else if (state === "in") {
    const preview = invite.you.chatPreview;
    rows = (
      <PlanRow
        href={chatHref}
        leading={<MessageTile />}
        title="Plan chat"
        meta={preview ? `${preview.from}: ${preview.text}` : "Say hello to everyone who’s going."}
        end={unread > 0 ? <CountChip n={unread} /> : null}
      />
    );
  } else if (state === "past") {
    rows = (
      <PlanRow href={chatHref} leading={<MessageTile />} title="Plan chat" meta="Closed. You can still read it." />
    );
  } else if (state === "cancelled") {
    rows = (
      <PlanRow
        href={ROUTES.openInvite}
        leading={
          <span className="mk-icon-tile">
            <Icon name="users" size={22} />
          </span>
        }
        title="See other Open Invites"
        meta="Plans from other members, soonest first."
      />
    );
  }
  const questionRows =
    state === "own" && questions.length > 0 ? (
      <>
        {questions.map((question) => (
          <PlanRow
            key={question.threadId}
            href={messageThreadHref(question.threadId)}
            leading={<Avatar photoUrl={question.from.photoUrl} name={question.from.firstName} size={48} />}
            title={question.from.firstName}
            meta={question.text}
            end={<CountChip n={question.unread} />}
          />
        ))}
      </>
    ) : null;
  const questionHead = (
    <div className="mk-sh" id="questions">
      <h2 className="mk-h2">Questions</h2>
      <span className="oi-meta">{questions.length} new</span>
    </div>
  );

  const safety = dead ? null : (
    <div className="oi-safe">
      <Icon name="shield" size={20} />
      <span>Meet somewhere public. Keep payments inside Club&nbsp;Yuppie.</span>
    </div>
  );

  // The right-hand column on a computer, and the tail on a phone.
  const sideDesk = (
    <>
      {state === "own" && questionRows ? (
        <div className="oi-sec">
          {questionHead}
          <Rows>{questionRows}</Rows>
        </div>
      ) : null}
      {state !== "own" && state !== "open" && state !== "full" && state !== "cancelled" && rows ? (
        <div className="oi-sec">
          <Rows>{rows}</Rows>
        </div>
      ) : null}
      {safety}
      <div className="oi-links">{report}</div>
    </>
  );
  const tail = (
    <>
      {state !== "own" && rows ? (
        <div className="oi-sec">
          <Rows>{rows}</Rows>
        </div>
      ) : null}
      {safety}
      <div className="oi-links">
        {withdraw}
        {cancel}
        {report}
      </div>
    </>
  );

  return (
    <Main pad={false} className="oi-planmain">
      <BackRow href={ROUTES.openInvite} label="Open Invite" actions={<BarMessages />} />

      <section className="oi-hero" aria-label="Open Invite">
        <div className="mk-wrap oi-hero-in">
          <KitLink className="oi-crumb" href={ROUTES.openInvite}>
            <Icon name="chevron-left" size={22} />
            Open Invite
          </KitLink>
          <div className="oi-hero-grid">
            <div className="oi-hero-main">
              <div className="oi-pills">{pills}</div>
              <h1 className="oi-h1">{invite.title}</h1>
              {notice}
              {facts}
              <Note invite={invite} mine={mine} className="mk-show-desk oi-hero-note" />
            </div>
            {card}
          </div>
          <div className="oi-hero-art mk-show-phone">
            <InkDrawing name="trainer" w={96} line={1.68} />
          </div>
        </div>
      </section>

      <section className="mk-band oi-detail" aria-label="Details">
        <div className="mk-wrap">
          <div className="oi-detail-grid">
            <div>
              {paid && mine ? <MoneyOwn invite={invite} /> : null}
              {state === "own" && questionRows ? (
                <div className="oi-sec mk-show-phone">
                  {questionHead}
                  <Rows>{questionRows}</Rows>
                </div>
              ) : null}
              <Note invite={invite} mine={mine} className="mk-show-phone" />
              {paid && (state === "open" || state === "in") ? <MoneyTile invite={invite} state={state} /> : null}
              {state !== "cancelled" ? (
                <div className="oi-sec">
                  <div className="mk-sh">
                    <h2 className="mk-h2">Who’s in</h2>
                    <span className="oi-meta">{going}</span>
                  </div>
                  <WhoGrid invite={invite} me={me} />
                </div>
              ) : null}
              {state === "cancelled" ? (
                <div className="oi-sec mk-show-desk">
                  <Rows>{rows}</Rows>
                </div>
              ) : null}
            </div>
            <div className="oi-side mk-show-desk">{sideDesk}</div>
          </div>
        </div>
      </section>

      <section className="oi-tail mk-show-phone" aria-label="More">
        <div className="mk-wrap">
          {tail}
          <div className="oi-end" />
        </div>
      </section>

      <div className="mk-dock-spacer" aria-hidden="true" />
      <ActionBar lead={barLead} sub={barSub}>
        {barButton}
      </ActionBar>
      {moments.sheet}
    </Main>
  );
}

export function PlanLoading() {
  return (
    <Main busy pad={false}>
      <span className="mk-sr">Loading</span>
      <BackRow href={ROUTES.openInvite} label="Open Invite" actions={<BarMessages />} />
      <section className="oi-hero" aria-hidden="true">
        <div className="mk-wrap oi-hero-in">
          <div className="oi-hero-grid">
            <div className="oi-hero-main">
              <div className="oi-pills">
                <Shape width={104} height={22} kind="pill" />
                <Shape width={104} height={22} kind="pill" />
              </div>
              <Shape width="80%" height={34} style={{ marginTop: 16 }} />
              <Shape width="56%" height={34} style={{ marginTop: 8 }} />
              <Shape width="44%" height={20} style={{ marginTop: 24 }} />
              <Shape width="48%" height={20} style={{ marginTop: 12 }} />
              <Shape width="30%" height={20} style={{ marginTop: 12 }} />
            </div>
          </div>
        </div>
      </section>
      <section className="mk-band oi-detail" aria-hidden="true">
        <div className="mk-wrap">
          <Shape height={88} kind="tile" />
          <Shape width={132} height={28} style={{ marginTop: 32 }} />
        </div>
      </section>
    </Main>
  );
}
