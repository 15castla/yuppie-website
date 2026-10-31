"use client";

// The top of every Open Invite tab page: the title row, the Browse | Yours
// switch, the "Got a plan?" composer row and (Browse) the filter chips.
// Kit counterpart: pages_oi.top_block(). The shell supplies the messages icon
// and your photo (TopActions: in the app they sit in the title row, on the
// web the phone bar carries them, on a computer the header does).
//
// The H1 here is not the kit's TitleBlock: the serif subline sits UNDER the
// whole row, because beside two 44px icons it wrapped at 320. In the app the
// H1 scales with the phone so "Open Invite." stays on one line (46px from 400
// up, 44px at 390, 31px at 320): see "R1" in invite.css.

import type { ReactNode } from "react";

import { Avatar, ExampleNote, Icon, KitLink, Segmented } from "@/components/members/kit";
import { MessagesButton } from "@/components/members/shell/messages-button";
import { useMessagesBadge, useShell } from "@/components/members/shell/shell-context";
import { TopActions } from "@/components/members/shell/top-actions";
import type { InviteMember } from "@/lib/members/invite/types";
import { ROUTES } from "@/lib/members/routes";
import { CountChip } from "./invite-card";

/** The messages icon at the end of a plan page's back row (Open Invite pages only; the shell says whether to draw it). */
export function BarMessages() {
  const { showMessages, messagesCurrent } = useShell();
  const unread = useMessagesBadge();
  return showMessages ? <MessagesButton unread={unread} current={messagesCurrent} /> : null;
}

export function InviteTitle() {
  return (
    <div className="oi-title">
      <div className="mk-head">
        <div className="mk-row1">
          <h1 className="mk-h1">Open Invite.</h1>
          <div className="mk-actions">
            <TopActions />
          </div>
        </div>
        <p className="mk-sub-serif">Plans, run by members.</p>
      </div>
    </div>
  );
}

export function ComposeRow({ me }: { me: InviteMember }) {
  return (
    <div className="oi-compose-wrap">
      <KitLink className="oi-compose" href={ROUTES.openInviteNew} aria-label="Post an Open Invite">
        <Avatar photoUrl={me.photoUrl} name={me.firstName} size={40} />
        <span className="tx">
          Got a plan? <span>Post an Open Invite</span>
        </span>
        <span className="plus" aria-hidden="true">
          <Icon name="plus" size={22} />
        </span>
      </KitLink>
    </div>
  );
}

export function InviteSwitch({ view, yoursCount }: { view: "browse" | "yours"; yoursCount: number }) {
  return (
    <div className="oi-seg-wrap">
      <Segmented
        label="Open Invite views"
        items={[
          { label: "Browse", href: ROUTES.openInvite, current: view === "browse" },
          {
            label: (
              <>
                Yours
                {yoursCount > 0 ? <CountChip n={yoursCount} /> : null}
              </>
            ),
            href: ROUTES.openInviteYours,
            current: view === "yours",
          },
        ]}
      />
    </div>
  );
}

/** `chips` is the filter row (Browse); without it the space the chips would take stays, so the band does not jump. */
export function InviteTop({
  view,
  yoursCount,
  me,
  chips,
}: {
  view: "browse" | "yours";
  yoursCount: number;
  me: InviteMember;
  chips?: ReactNode;
}) {
  return (
    <div className="mk-wrap">
      <div className="oi-top">
        <InviteTitle />
        <InviteSwitch view={view} yoursCount={yoursCount} />
        <ComposeRow me={me} />
        {chips ? <div className="oi-chips-wrap">{chips}</div> : <div className="oi-chips-wrap oi-yours-gap" />}
      </div>
      <ExampleNote inside className="oi-ex" />
    </div>
  );
}
