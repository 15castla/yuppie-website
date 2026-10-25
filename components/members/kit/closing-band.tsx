// Kit counterpart: the public site's closing move, as the Discounts and Access
// designs draw it (disc closing band): a yellow band under a 3px ink rule
// with a headline (a serif accent on the last line), one lead line, one
// button, and a public drawing standing on the rule at the foot (phone) or
// the right (computer). The drawing is the public site's (PerkDrawing);
// nothing is redrawn.
//
// Put it last in a <Main fill>, so on a short page it still reaches down to
// the tab bar's rule. For the cream Open Invite band with a card (the Events
// page), compose .mk-band / .mk-band-grid yourself: see FOUNDATION_NOTES.

import type { ReactNode } from "react";

import { PerkDrawing, type PerkDrawingName } from "./drawings";

export function ClosingBand({
  title,
  accent,
  lead,
  action,
  drawing,
  label,
}: {
  /** The headline before the accent: "Know a place we should add?" */
  title: ReactNode;
  /** The serif italic last line: "Tell us." */
  accent?: ReactNode;
  lead?: ReactNode;
  /** One button (a <Button blockPhone>). */
  action?: ReactNode;
  drawing?: PerkDrawingName;
  /** The section's accessible name. */
  label: string;
}) {
  return (
    <section className="mk-close" aria-label={label}>
      <div className="mk-wrap">
        <div className="mk-close-in">
          <div className="mk-close-words">
            <h2 className="mk-close-h">
              {title}
              {accent ? (
                <>
                  <br />
                  <span className="mk-serif">{accent}</span>
                </>
              ) : null}
            </h2>
            {lead ? <p className="mk-lead">{lead}</p> : null}
            {action ? <div className="mk-close-act">{action}</div> : null}
          </div>
          {drawing ? (
            <div className="mk-art mk-close-art">
              <PerkDrawing name={drawing} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
