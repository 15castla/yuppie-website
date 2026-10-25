// The bands under the Open Invite feed: the closing "Post your own" move, and
// the empty and error states. Kit counterparts: pages_oi.closing_band() and
// pages_oi.empty_band(). Each drawing stands on a rule (RULE-07): the closing
// band's coupes on the tab bar's own 3px rule, the empty band's on the
// bottom of its cream band.

import type { ReactNode } from "react";

import { Button, KitLink } from "@/components/members/kit";
import { ROUTES } from "@/lib/members/routes";
import { InkDrawing, type InkDrawingName } from "./ink-drawing";

export function CloseBand() {
  return (
    <section className="oi-close" aria-label="Post your own">
      <div className="mk-wrap">
        <div className="oi-close-in">
          <div className="oi-close-words">
            <h2 className="oi-close-h">
              Nothing that suits?
              <br />
              <span className="mk-serif">Post your own.</span>
            </h2>
            <p className="mk-lead">Pick a day, say where, and see who’s in.</p>
            <div className="oi-close-act">
              <Button href={ROUTES.openInviteNew} blockPhone>
                Post an Open Invite
              </Button>
            </div>
          </div>
          <div className="oi-close-art-wrap">
            <InkDrawing name="coupes" h={104} line={1.68} className="oi-close-art" />
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = ["Post an invite", "Members say yes", "Go together"];

export function EmptyBand({
  title,
  accent,
  lead,
  primary,
  secondary,
  drawing,
  steps = false,
  label = "Nothing to show",
}: {
  title: ReactNode;
  accent: string;
  lead: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  drawing: { name: InkDrawingName; w: number; line: number };
  steps?: boolean;
  label?: string;
}) {
  return (
    <section className="mk-band oi-band oi-emptyband" aria-label={label}>
      <div className="mk-wrap">
        <div className="oi-empty-in">
          <div className="oi-empty-words">
            <h2 className="oi-empty-h">
              {title} <span className="mk-serif">{accent}</span>
            </h2>
            <p className="mk-lead">{lead}</p>
            <div className="oi-empty-act">
              {primary}
              {secondary}
            </div>
            {steps ? (
              <ol className="oi-steps">
                {STEPS.map((step, index) => (
                  <li key={step}>
                    <span className="mk-serif">{index + 1}</span>
                    <b>{step}</b>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          <div className="oi-empty-art">
            <InkDrawing name={drawing.name} w={drawing.w} line={drawing.line} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function PostLink({ children = "Post an Open Invite" }: { children?: ReactNode }) {
  return (
    <KitLink className="mk-link" href={ROUTES.openInviteNew}>
      {children}
    </KitLink>
  );
}
