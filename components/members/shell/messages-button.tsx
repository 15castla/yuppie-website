// Kit counterpart: k2.msg_btn(unread, current). The round 44px messages icon
// with an unread badge ("9+" over 9). It appears on Open Invite pages only,
// and only when the page asks for it (MembersFrame showMessages): never on
// Events, Discounts, Access, You or Concierge. The number counts unread chats
// plus updates.

import { Icon } from "../kit/icons";
import { KitLink } from "../kit/link";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";

export function MessagesButton({
  unread = 0,
  current = false,
  ink = false,
}: {
  unread?: number;
  current?: boolean;
  ink?: boolean;
}) {
  return (
    <KitLink
      href={ROUTES.messages}
      className={cn("mk-icon-btn", ink && "mk-ink")}
      aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      aria-current={current ? "page" : undefined}
    >
      <Icon name="message" size={22} />
      {unread ? <span className="mk-badge">{unread < 10 ? unread : "9+"}</span> : null}
    </KitLink>
  );
}
