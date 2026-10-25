// Kit counterpart: k2.title_block(h1, sub, lead, actions). The title of a tab
// page: a 46px H1 ("Events."), a serif italic subline, an optional lead
// sentence, and, in the app only, the top actions on the same row (the
// messages icon on Open Invite pages, then your photo). On the web the photo
// lives in the shell's phone bar and desktop header, so the CSS hides the
// actions there.
//
// `actions` defaults to the shell's TopActions, which knows the member's
// photo and whether this page shows the messages icon. Pass your own node to
// replace it, or null for none.
//
// In the app the row's top padding is the status area (the safe inset) plus
// 10px: this block, or a BackRow, is what clears the notch. Pages that draw
// neither must clear it themselves.

import type { ReactNode } from "react";

import { TopActions } from "../shell/top-actions";

export function Serif({ children }: { children: ReactNode }) {
  return <span className="mk-serif">{children}</span>;
}

export function TitleBlock({
  title,
  sub,
  lead,
  actions,
}: {
  /** The H1, with its full stop: "Events.". A <Serif> inside draws the serif accent. */
  title: ReactNode;
  /** The serif italic subline: "Run by us, at cost." */
  sub?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode | null;
}) {
  return (
    <div className="mk-wrap">
      <div className="mk-head">
        <div className="mk-row1">
          <div>
            <h1 className="mk-h1">{title}</h1>
            {sub ? <p className="mk-sub-serif">{sub}</p> : null}
          </div>
          <div className="mk-actions">{actions === undefined ? <TopActions /> : actions}</div>
        </div>
        {lead ? <p className="mk-lead">{lead}</p> : null}
      </div>
    </div>
  );
}
