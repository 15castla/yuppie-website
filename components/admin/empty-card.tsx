// The admin's empty and all-clear card (r2b: "a public drawing stands on the card's bottom edge").

import type { ReactNode } from "react";

import { PerkDrawing, type PerkDrawingName } from "@/components/members/kit/drawings";

export function EmptyCard({
  a,
  b,
  when,
  line,
  sub,
  art,
  action,
}: {
  a: string;
  b: string;
  when?: string;
  line: string;
  sub: string;
  art: PerkDrawingName;
  action?: ReactNode;
}) {
  return (
    <div className="ad-card floor">
      <div className="ad-cardhead">
        <h2 className="ad-h2lg">
          {a} <span className="ad-serif">{b}</span>
        </h2>
        {when && <span className="when">{when}</span>}
      </div>
      <div className="ad-clear">
        <div className="tx">
          <b>{line}</b>
          <p>{sub}</p>
          {action && <div className="ad-acts">{action}</div>}
        </div>
        <span className="ad-art" aria-hidden="true">
          <PerkDrawing name={art} />
        </span>
      </div>
    </div>
  );
}
