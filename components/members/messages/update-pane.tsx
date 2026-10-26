// The computer's right-hand pane next to Updates. A tap on an update would
// leave Messages for the plan, so on a computer the pane previews the plan the
// selected update is about: the update, the plan, who is going, and the two
// ways on ("Open the plan", "Open chat"). Kit counterpart: pages_msg.upd_pane().

import { Avatar, Button, DateColumn, Icon } from "@/components/members/kit";
import { clock, dateTile, goingHeading, updateStamp, updatePaneTitle } from "@/lib/members/messages/format";
import type { MemberRef, UpdateItem } from "@/lib/members/messages/types";
import { messageThreadHref, openInviteHref } from "@/lib/members/routes";

function personLine(update: UpdateItem, member: MemberRef, youId: string | null): string | null {
  const isHost = update.plan.host.id === member.id;
  const isYou = member.id === youId;
  if (isHost) return isYou ? "Host · you" : "Host";
  if (update.kind === "joined" && update.actor?.id === member.id) return `Joined ${clock(update.at)}`;
  if (isYou) return "You";
  return null;
}

export function UpdatePane({
  update,
  now,
  youId,
}: {
  update: UpdateItem;
  now: string;
  /** The signed-in member (labels "Host · you"). */
  youId: string | null;
}) {
  const plan = update.plan;
  const tile = dateTile(plan.startsAt);
  return (
    <div className="msg-upd-card" role="region" aria-label="Update">
      <div className="msg-upd-hd">
        <span className="mk-term">{updateStamp(update, now)}</span>
        <h2 className="mk-h2">{updatePaneTitle(update, now)}</h2>
      </div>
      <div className="msg-upd-plan">
        <DateColumn weekday={tile.weekday} day={tile.day} />
        <div>
          <div className="mk-h3">{plan.title}</div>
          <div className="mk-meta-line">
            {clock(plan.startsAt)} · {plan.place}
          </div>
        </div>
      </div>
      <div className="msg-sec-t" style={{ marginTop: 22 }}>
        {goingHeading(plan)}
      </div>
      <div className="msg-upd-list">
        {plan.going.map((member) => {
          const line = personLine(update, member, youId);
          return (
            <div key={member.id} className="msg-upd-p">
              <Avatar photoUrl={member.photoUrl} name={member.firstName} size={44} />
              <span>
                <b>{member.firstName}</b>
                {line ? <small>{line}</small> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="msg-upd-acts">
        <Button href={openInviteHref(plan.id)}>Open the plan</Button>
        {update.chatId ? (
          <Button variant="outline" href={messageThreadHref(update.chatId)} icon={<Icon name="message" size={20} />}>
            Open chat
          </Button>
        ) : null}
      </div>
    </div>
  );
}
