// The rows of the two inbox lists, as pure components of props.
//   ChatRow    a plan chat leads with the date tile, a question with the person's
//              photo; title, one muted line (place or invite) with the time, then
//              the last message with its sender; unread reads stronger (heavier
//              title, ink last line and time, one ink dot).
//   UpdateRow  a photo of the person it is about, or an ink circle with an icon
//              when nobody did anything; one sentence, a detail line, the time.
// Kit counterparts: pages_msg.inbox_row() and upd_row().

import type { MouseEvent, ReactNode } from "react";

import { Avatar, DateColumn, Icon, KitLink, type IconName } from "@/components/members/kit";
import { cn } from "@/lib/utils";
import { dateTile, pounds, rowTime, updateDetail, updateText, updateTime } from "@/lib/members/messages/format";
import type { Chat, UpdateItem } from "@/lib/members/messages/types";
import { messageThreadHref, openInviteHref } from "@/lib/members/routes";

function senderLabel(chat: Chat): string | null {
  const last = chat.lastMessage;
  if (!last || last.senderId === null) return null;
  const sender = chat.participants.find((p) => p.member.id === last.senderId);
  if (!sender) return null;
  return sender.isYou ? "You" : sender.member.firstName;
}

function chatMeta(chat: Chat): string {
  if (chat.status === "closed") return "Closed · read only";
  if (chat.kind === "question") return `About ${chat.plan.title}`;
  const price = chat.plan.priceMinor ? ` · ${pounds(chat.plan.priceMinor)} each` : "";
  return `${chat.plan.place}${price}`;
}

export function ChatRow({
  chat,
  now,
  selected = false,
  current = selected,
  unread,
}: {
  chat: Chat;
  now: string;
  /** The open chat on a computer: a pale fill, and it counts as read (the CSS draws it only from 1024px). */
  selected?: boolean;
  /** aria-current: this is the chat that is open. */
  current?: boolean;
  /** Overrides chat.unreadCount > 0 (a chat read in this session). */
  unread?: boolean;
}) {
  const isUnread = unread ?? chat.unreadCount > 0;
  const title = chat.kind === "plan" ? chat.plan.title : (chat.other?.firstName ?? "Question");
  const tile = dateTile(chat.plan.startsAt);
  const lead =
    chat.kind === "plan" ? (
      <DateColumn weekday={tile.weekday} day={tile.day} />
    ) : (
      <Avatar photoUrl={chat.other?.photoUrl} name={chat.other?.firstName} size={44} />
    );
  const sender = senderLabel(chat);
  const last = chat.lastMessage;
  const label = `${isUnread ? "Unread. " : ""}${chat.kind === "plan" ? "Plan chat" : "Question"}. ${title}`;
  return (
    <KitLink
      href={messageThreadHref(chat.id)}
      className={cn("msg-row", isUnread && "is-unread", chat.status === "closed" && "is-closed", selected && "is-selected")}
      aria-label={label}
      aria-current={current ? "true" : undefined}
    >
      {lead}
      <span className="msg-bd">
        <span className="msg-title">{title}</span>
        <span className="msg-r2">
          <span className="msg-meta">{chatMeta(chat)}</span>
          <span className="msg-time">{last ? rowTime(last.at, now) : ""}</span>
        </span>
        <span className="msg-r3">
          <span className="msg-last">
            {last ? (
              sender ? (
                <>
                  <b>{sender}:</b> {last.text}
                </>
              ) : (
                last.text
              )
            ) : (
              ""
            )}
          </span>
          {isUnread ? <i className="msg-dot" aria-hidden="true" /> : null}
        </span>
      </span>
    </KitLink>
  );
}

// Which icon leads an update that nobody did (a reminder, a full plan, a place opening up).
function updateIcon(update: UpdateItem): IconName {
  return update.kind === "reminder" ? "clock" : "users";
}

export function UpdateRow({
  update,
  now,
  selected = false,
  unread,
  href,
  onSelect,
}: {
  update: UpdateItem;
  now: string;
  selected?: boolean;
  unread?: boolean;
  /** Where a tap goes: the plan (or the event), never a chat. Default: the plan page. */
  href?: string;
  /**
   * Called on the tap. From 1024px the list sits beside a preview of the plan, so the tap picks the update
   * (preventDefault) instead of leaving Messages; on a phone it reads the update on its way to the plan.
   */
  onSelect?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const isUnread = unread ?? !update.read;
  const text = updateText(update, now);
  let lead: ReactNode;
  if (update.actor) {
    lead = <Avatar photoUrl={update.actor.photoUrl} name={update.actor.firstName} size={44} />;
  } else {
    lead = (
      <span className="msg-ic" aria-hidden="true">
        <Icon name={updateIcon(update)} size={22} />
      </span>
    );
  }
  return (
    <KitLink
      href={href ?? openInviteHref(update.plan.id)}
      className={cn("msg-row msg-upd", isUnread && "is-unread", selected && "is-selected")}
      aria-label={`${isUnread ? "Unread. " : ""}${text}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      {lead}
      <span className="msg-bd">
        <span className="msg-title">{text}</span>
        <span className="msg-r2">
          <span className="msg-meta">{updateDetail(update)}</span>
          <span className="msg-time">{updateTime(update.at, now)}</span>
          <span className="msg-dotslot">{isUnread ? <i className="msg-dot" aria-hidden="true" /> : null}</span>
        </span>
      </span>
    </KitLink>
  );
}
