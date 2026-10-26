// The words of a thread that depend on the chat: the header, the pinned card,
// the system lines, the closed notice, the empty-thread prompt. Pure strings
// (no React), so the screens and the tests read the same copy. House rules:
// typographic apostrophes, no em dashes, no exclamation marks, 24-hour times.

import { clock, dateAndTime, pounds, shortDate } from "./format";
import type { Chat, ChatSystemLine, MemberRef } from "./types";

export const LINK_BLOCKED_LINE = "Links can’t be sent in chats. Tell people where to find it instead.";
export const SELECT_BANNER = "Tap the message you want to report.";

/** Who "other" is in a question: the host when you asked, the asker when you host. */
export function youHost(chat: Chat, youId: string): boolean {
  return chat.plan.host.id === youId;
}

export function threadTitle(chat: Chat): string {
  return chat.kind === "plan" ? chat.plan.title : (chat.other?.firstName ?? "Question");
}

/** The header's second line. */
export function threadSub(chat: Chat): string {
  const { plan } = chat;
  if (chat.kind === "question") return `About ${plan.title}`;
  if (plan.status === "cancelled") return `Cancelled · ${shortDate(plan.startsAt)}`;
  if (chat.status === "closed") return `Closed · ${shortDate(plan.startsAt)}`;
  return `${dateAndTime(plan.startsAt)} · ${plan.place}`;
}

function placesText(placesLeft: number): string {
  if (placesLeft <= 0) return "No places left";
  return `${placesLeft} ${placesLeft === 1 ? "place" : "places"} left`;
}

export type PinCopy = {
  /** What leads: the people going (a plan chat) or the date tile (a question). */
  lead: "people" | "date";
  /** The bold first line. */
  title: string;
  /** "Posted by Jasmin · ": dropped on the narrowest phones so "See the invite" is never cut. */
  posted: string | null;
  /** The rest of the second line. */
  rest: string;
  /** The one-line fold while the keyboard is up. */
  compact: [string, string];
};

/** The pinned card under the header; it opens the invite. */
export function pinCopy(chat: Chat, youId: string): PinCopy {
  const { plan } = chat;
  const hosting = youHost(chat, youId);
  const price = plan.priceMinor ? `${pounds(plan.priceMinor)} each · ` : "";
  const finished = plan.status === "finished" || (chat.status === "closed" && plan.status === "open");

  if (plan.status === "cancelled") {
    const refund = plan.priceMinor && !hosting ? `Your ${pounds(plan.priceMinor)} is refunded · ` : "";
    return {
      lead: chat.kind === "plan" ? "people" : "date",
      title: "Cancelled",
      posted: null,
      rest: `${refund}See the invite`,
      compact: ["Cancelled", plan.priceMinor && !hosting ? `Your ${pounds(plan.priceMinor)} is refunded` : "See the invite"],
    };
  }

  if (chat.kind === "question") {
    if (finished) {
      return { lead: "date", title: "Finished", posted: null, rest: "See the invite", compact: ["Finished", "See the invite"] };
    }
    return {
      lead: "date",
      title: `${clock(plan.startsAt)} · ${plan.place}`,
      posted: null,
      rest: `${placesText(plan.placesLeft)} · See the invite`,
      compact: [dateAndTime(plan.startsAt), plan.place],
    };
  }

  const posted = `Posted by ${plan.host.firstName} · `;
  if (finished) {
    return { lead: "people", title: "Finished", posted, rest: "See the invite", compact: ["Finished", "See the invite"] };
  }
  const going = `${plan.going.length} going, ${plan.placesLeft <= 0 ? "no places left" : placesText(plan.placesLeft)}`;
  return {
    lead: "people",
    title: going,
    posted,
    rest: `${price}See the invite`,
    compact: [going, `${price}See the invite`],
  };
}

/** The lock row's notice when a chat is closed. */
export function closedNote(chat: Chat): string {
  if (chat.closedReason === "host_cancelled" || chat.plan.status === "cancelled") {
    return `${chat.plan.host.firstName} cancelled this plan.`;
  }
  if (chat.closedReason === "invite_closed") return "Questions close when the invite closes.";
  return "Plan chats close 24 hours after the plan.";
}

export type SystemLineCopy = {
  /** A small card icon leads a paid line. */
  icon: "credit-card" | null;
  /** The name, in bold. */
  bold: string | null;
  /** What follows (with its leading space after a name). */
  text: string;
};

export function systemLineCopy(item: ChatSystemLine, chat: Chat, nameOf: (id: string | null) => string): SystemLineCopy {
  const who = nameOf(item.memberId);
  switch (item.event) {
    case "opened":
      return { icon: null, bold: null, text: `${who} opened this chat` };
    case "joined":
      return { icon: null, bold: who, text: " is in" };
    case "paid":
      return { icon: "credit-card", bold: who, text: " paid and is in" };
    case "cancelled":
      return {
        icon: null,
        bold: who,
        text: chat.plan.priceMinor ? " cancelled this plan. Everyone is refunded." : " cancelled this plan.",
      };
    case "closed":
      return {
        icon: null,
        bold: null,
        text:
          chat.closedReason === "invite_closed"
            ? "This chat closed. Questions close when the invite closes."
            : "This chat closed. Plan chats close 24 hours after the plan.",
      };
  }
}

/** The prompt that fills an empty thread. */
export function emptyPrompt(chat: Chat): { title: string; body: string } {
  if (chat.kind === "question") {
    const other = chat.other?.firstName ?? "the host";
    return {
      title: `Ask ${other} anything about the plan.`,
      body: `${other} gets a notification. Say you’re in on the invite when you’re ready.`,
    };
  }
  return { title: "Say hello.", body: "This is where the plan gets sorted: where to meet, what to bring." };
}

/** The intro block at the top of a question thread. */
export function questionIntro(chat: Chat, youId: string): { name: string; line: string; note: string; member: MemberRef | null } {
  const other = chat.other;
  const name = other?.firstName ?? "";
  return {
    name,
    member: other,
    line: youHost(chat, youId) ? `Asked about ${chat.plan.title}` : `Host of ${chat.plan.title}`,
    note: `Only you and ${name} can see this chat.`,
  };
}
