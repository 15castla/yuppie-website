"use client";

// Open Invite > Yours. Kit counterpart: pages_oi.yours_main(). What needs me:
// "Posted by you" (the people who asked a question sit inside the card), "You're
// in", then Past as quiet rows. Two columns from 768px. Empty: "Nothing yet."
// A pure view of OpenInviteYours.

import "./invite.css";

import { Button, Main, Pill, Row, Rows, Shape } from "@/components/members/kit";
import { dateColumn, formatTime } from "@/lib/members/invite/format";
import type { OpenInvite, OpenInviteYours } from "@/lib/members/invite/types";
import { openInviteHref, ROUTES } from "@/lib/members/routes";
import { EmptyBand, PostLink } from "./bands";
import { InviteCard } from "./invite-card";
import { InviteTitle, InviteTop } from "./top-block";
import { useMoments, type Moment } from "./use-moments";

function Group({ title, count, noun }: { title: string; count: number; noun: "invite" | "plan" }) {
  return (
    <div className="oi-grp">
      <h2>{title}</h2>
      <span>
        {count} {count === 1 ? noun : `${noun}s`}
      </span>
    </div>
  );
}

function PastRow({ invite }: { invite: OpenInvite }) {
  const posted = invite.you.role === "host";
  return (
    <Row
      href={openInviteHref(invite.id)}
      date={dateColumn(invite.startsAt)}
      title={invite.title}
      meta={`${formatTime(invite.startsAt)} · ${invite.where}`}
      end={<Pill kind="muted">{posted ? "You posted" : "You were in"}</Pill>}
    />
  );
}

export function YoursView({
  yours,
  paidPlans,
  initialMoment = null,
  initialPendingId = null,
}: {
  yours: OpenInviteYours;
  paidPlans: boolean;
  initialMoment?: Moment | null;
  initialPendingId?: string | null;
}) {
  const keep = (list: OpenInvite[]) => list.filter((invite) => paidPlans || invite.cost === null);
  const { plans, pendingId, join, sheet } = useMoments({
    plans: [...keep(yours.posted), ...keep(yours.joined)],
    me: yours.me,
    nowIso: yours.now,
    seeOtherHref: ROUTES.openInvite,
    initialMoment,
    initialPendingId,
    paidPlans,
  });
  const posted = plans.filter((invite) => yours.posted.some((entry) => entry.id === invite.id));
  const joined = plans.filter((invite) => yours.joined.some((entry) => entry.id === invite.id));
  const past = keep(yours.past);
  const empty = posted.length + joined.length + past.length === 0;

  return (
    <Main pad={past.length > 0} fill={posted.length + joined.length === 0}>
      <InviteTop view="yours" yoursCount={yours.yoursCount} me={yours.me} />

      {posted.length + joined.length > 0 ? (
        <section className="mk-band oi-band" aria-label="Yours">
          <div className="mk-wrap">
            <div className="oi-feed oi-yours">
              {posted.length > 0 ? (
                <div className="oi-col">
                  <Group title="Posted by you" count={posted.length} noun="invite" />
                  {posted.map((invite) => (
                    <InviteCard key={invite.id} invite={invite} me={yours.me} withQuestions />
                  ))}
                </div>
              ) : null}
              {joined.length > 0 ? (
                <div className="oi-col">
                  <Group title="You’re in" count={joined.length} noun="plan" />
                  {joined.map((invite) => (
                    <InviteCard
                      key={invite.id}
                      invite={invite}
                      me={yours.me}
                      pending={pendingId === invite.id}
                      onJoin={join}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="oi-past" aria-label="Past">
          <div className="mk-wrap">
            <Group title="Past" count={past.length} noun="plan" />
            <Rows>
              {past.map((invite) => (
                <PastRow key={invite.id} invite={invite} />
              ))}
            </Rows>
          </div>
        </section>
      ) : null}

      {empty ? (
        <EmptyBand
          title="Nothing"
          accent="yet."
          lead="Invites you post and plans you join show up here."
          primary={
            <Button href={ROUTES.openInvite} blockPhone>
              See Open Invites
            </Button>
          }
          secondary={<PostLink />}
          drawing={{ name: "coupes", w: 170, line: 2 }}
        />
      ) : null}
      {sheet}
    </Main>
  );
}

export function YoursLoading() {
  return (
    <Main busy pad={false}>
      <span className="mk-sr">Loading</span>
      <div className="mk-wrap">
        <div className="oi-top">
          <InviteTitle />
          <div className="oi-seg-wrap">
            <Shape width={264} height={48} kind="pill" />
          </div>
          <div className="oi-compose-wrap">
            <Shape height={52} kind="pill" />
          </div>
          <div className="oi-chips-wrap oi-yours-gap" />
        </div>
      </div>
      <section className="mk-band oi-band" aria-hidden="true">
        <div className="mk-wrap">
          <div className="oi-feed oi-yours">
            <div className="oi-col">
              <Shape width={168} height={32} />
              <Shape height={264} kind="tile" className="oi-sk-card" />
            </div>
            <div className="oi-col">
              <Shape width={128} height={32} />
              <Shape height={264} kind="tile" className="oi-sk-card" />
            </div>
          </div>
        </div>
      </section>
    </Main>
  );
}
