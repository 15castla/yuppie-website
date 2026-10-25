// A thread's items turned into what the stream draws: day separators, system
// lines, the "N new messages" divider, and runs ("groups") of bubbles from one
// sender. Pure: the view only maps these to markup. Rules (from the design):
//   - a run is consecutive messages from one sender on one day, with nothing
//     between them; the time shows once, under the last bubble;
//   - a message still sending, or one that failed, is its own run (its
//     "Sending…" or "Not sent, Retry, Delete" sits under it, where the time
//     would be);
//   - a run also breaks after ten quiet minutes, so a time never stands for
//     bubbles hours apart (an addition: the design only shows short runs);
//   - messages from a member you blocked are not drawn at all.

import { clock, dayLabel } from "./format";
import { systemLineCopy, type SystemLineCopy } from "./thread-copy";
import type { Chat, ChatItem, ChatMessage, MemberRef, OutgoingMessage } from "./types";

export type GroupMessage = {
  id: string;
  /** Set on a message you wrote on this device. */
  clientId?: string;
  text: string;
  sentAt: string;
  state: "sent" | "removed" | "sending" | "failed";
};

export type StreamRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "new"; key: string; label: string }
  | ({ kind: "system"; key: string } & SystemLineCopy)
  | { kind: "group"; key: string; mine: boolean; sender: MemberRef | null; isHost: boolean; messages: GroupMessage[] };

const BREAK_MS = 10 * 60 * 1000;

export function memberOf(chat: Chat, id: string | null): MemberRef | null {
  if (!id) return null;
  const found = chat.participants.find((participant) => participant.member.id === id)?.member;
  if (found) return found;
  return [...chat.plan.going, chat.plan.host, ...(chat.other ? [chat.other] : [])].find((member) => member.id === id) ?? null;
}

export function buildRows({
  chat,
  items,
  sentHere,
  outgoing,
  blockedIds,
  firstUnreadId,
  youId,
  now,
}: {
  chat: Chat;
  items: readonly ChatItem[];
  /** Messages you sent in this session (they have been delivered). */
  sentHere: readonly ChatMessage[];
  outgoing: readonly OutgoingMessage[];
  blockedIds: readonly string[];
  firstUnreadId: string | null;
  youId: string;
  now: string;
}): StreamRow[] {
  const rows: StreamRow[] = [];
  const nameOf = (id: string | null) => memberOf(chat, id)?.firstName ?? "Someone";
  const unreadLabel = `${chat.unreadCount} new ${chat.unreadCount === 1 ? "message" : "messages"}`;

  let day: string | null = null;
  let open: Extract<StreamRow, { kind: "group" }> | null = null;
  let openAt = 0;

  const push = (row: StreamRow) => {
    rows.push(row);
    open = null;
  };

  const addMessage = (message: GroupMessage, senderId: string) => {
    const at = Date.parse(message.sentAt);
    const mine = senderId === youId;
    const solo = message.state === "sending" || message.state === "failed";
    const lastState = open ? open.messages[open.messages.length - 1].state : null;
    if (open && !solo && lastState !== "sending" && lastState !== "failed" && open.sender?.id === senderId && at - openAt <= BREAK_MS) {
      open.messages.push(message);
      openAt = at;
      return;
    }
    const group: Extract<StreamRow, { kind: "group" }> = {
      kind: "group",
      key: `g-${message.id}`,
      mine,
      sender: memberOf(chat, senderId),
      isHost: senderId === chat.plan.host.id,
      messages: [message],
    };
    // Keep the sender id even when the member is not in the chat any more.
    if (!group.sender) group.sender = { id: senderId, firstName: "Someone", photoUrl: null };
    rows.push(group);
    open = group;
    openAt = at;
  };

  const all: ChatItem[] = [...items, ...sentHere];
  for (const item of all) {
    const at = item.kind === "text" ? item.sentAt : item.at;
    const label = dayLabel(at, now);
    if (label !== day) {
      day = label;
      push({ kind: "day", key: `d-${item.id}`, label });
    }
    if (item.id === firstUnreadId && chat.unreadCount > 0) {
      push({ kind: "new", key: `n-${item.id}`, label: unreadLabel });
    }
    if (item.kind === "system") {
      push({ kind: "system", key: item.id, ...systemLineCopy(item, chat, nameOf) });
      continue;
    }
    if (blockedIds.includes(item.senderId)) continue;
    addMessage(
      {
        id: item.id,
        clientId: item.clientId,
        text: item.text,
        sentAt: item.sentAt,
        state: item.status === "removed" ? "removed" : "sent",
      },
      item.senderId,
    );
  }

  for (const pending of outgoing) {
    const stamp = new Date(Date.parse(now)).toISOString();
    const label = dayLabel(stamp, now);
    if (label !== day) {
      day = label;
      push({ kind: "day", key: `d-${pending.clientId}`, label });
    }
    addMessage({ id: pending.clientId, clientId: pending.clientId, text: pending.text, sentAt: stamp, state: pending.state }, youId);
  }
  return rows;
}

export function groupTime(group: Extract<StreamRow, { kind: "group" }>): string {
  return clock(group.messages[group.messages.length - 1].sentAt);
}
