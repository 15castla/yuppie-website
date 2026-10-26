// Where an Open Invite page hands over to chat (specs/messages.md 3.9). These
// are the chat buttons only: the invite page's owner places them in its own
// card and passes the links. "I'm in" stays where it is (on a paid plan it
// reads "Pay and join"; "Open chat" appears after paying).
//
//   in    the member is in: "Open chat", primary, with the number of chats that
//         have news (nothing when there is none);
//   ask   the member has not said yes: "Ask {host} a question", secondary,
//         under "I'm in" (asking is quieter than saying yes);
//   host  someone asked the host a question: "2 questions", secondary, with the
//         count; it opens the inbox on the questions.
//
// Not wired into any invite page here (the Open Invite pages are another
// builder's): the registry draws them in a card (msg-handover).

import { Button, Icon } from "@/components/members/kit";
import "./messages.css";

export type ChatEntry =
  | { kind: "in"; href: string; /** Chats with news, across the member's plan chats; 0 draws no number. */ unread?: number }
  | { kind: "ask"; href: string; hostName: string }
  | { kind: "host"; href: string; questions: number };

export function ChatEntryButtons({ entry }: { entry: ChatEntry }) {
  const icon = <Icon name="message" size={20} />;
  if (entry.kind === "in") {
    return (
      <Button block href={entry.href} icon={icon}>
        Open chat
        {entry.unread ? <span className="msg-inbtn">{entry.unread}</span> : null}
      </Button>
    );
  }
  if (entry.kind === "ask") {
    return (
      <Button variant="outline" block href={entry.href} icon={icon}>
        Ask {entry.hostName} a question
      </Button>
    );
  }
  return (
    <Button variant="outline" block href={entry.href} icon={icon}>
      {entry.questions === 1 ? "1 question" : `${entry.questions} questions`}
      <span className="msg-inbtn">{entry.questions}</span>
    </Button>
  );
}
