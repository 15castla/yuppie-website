// Kit counterpart: the empty band of the Discounts, Access, Yours and Blocked
// designs: a cream band between 3px ink rules with a headline (the last words
// in the serif accent: "Nothing here yet."), one plain line, one action, and
// a public drawing standing on the rule. Never a sad face, never a spinner.
// Like ClosingBand, put it last in a <Main fill>.

import type { ReactNode } from "react";

import { PerkDrawing, type PerkDrawingName } from "./drawings";

export function EmptyState({
  title,
  accent,
  lead,
  action,
  secondary,
  drawing,
  label = "Nothing to show",
}: {
  /** "Nothing here" */
  title: ReactNode;
  /** The serif accent: "yet." */
  accent?: ReactNode;
  lead?: ReactNode;
  /** The one action (a <Button blockPhone>). */
  action?: ReactNode;
  /** A quiet link beside it (a <Button variant="quiet">). */
  secondary?: ReactNode;
  drawing?: PerkDrawingName;
  label?: string;
}) {
  return (
    <section className="mk-empty" aria-label={label}>
      <div className="mk-wrap">
        <div className="mk-empty-in">
          <div className="mk-empty-words">
            <h2 className="mk-empty-h">
              {title}
              {accent ? (
                <>
                  {" "}
                  <span className="mk-serif">{accent}</span>
                </>
              ) : null}
            </h2>
            {lead ? <p className="mk-lead">{lead}</p> : null}
            {action || secondary ? (
              <div className="mk-empty-act">
                {action}
                {secondary}
              </div>
            ) : null}
          </div>
          {drawing ? (
            <div className="mk-art mk-empty-art">
              <PerkDrawing name={drawing} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
