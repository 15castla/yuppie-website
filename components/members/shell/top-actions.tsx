"use client";

// Kit counterpart: k2.top_actions(active, unread): the messages icon ONLY on
// Open Invite pages (the frame decides: showMessages), then your photo.
// The phone bar (web) and a page's title row (app) both draw this; on a
// computer the header draws its own.

import { MessagesButton } from "./messages-button";
import { ShellPhotoButton } from "./photo-button";
import { useMessagesBadge, useShell } from "./shell-context";

export function TopActions() {
  const { showMessages, messagesCurrent } = useShell();
  const unread = useMessagesBadge();
  return (
    <>
      {showMessages ? <MessagesButton unread={unread} current={messagesCurrent} /> : null}
      <ShellPhotoButton />
    </>
  );
}
