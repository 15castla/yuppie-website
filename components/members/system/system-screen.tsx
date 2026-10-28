// The one system page (r2b section 1): the page's own title block, a 3px ink rule, and a cream band that
// holds what to do next, with a public drawing standing on the floor. Page error, not found and maintenance
// are all this, with different words, a different drawing and a different floor. Pure: props in, markup out,
// so the real pages and the preview harness draw the same thing.
//
//   floor "dock"  inside the members shell: on a phone the band runs down to the tab bar's own rule
//   floor "own"   no tab bar (public pages, maintenance): the band closes with its own rule and a yellow strip

import "./system.css";

import Image from "next/image";
import type { ReactNode } from "react";

import { Main, Serif } from "@/components/members/kit";
import { cn } from "@/lib/utils";
import { SystemArt, type SystemArtName } from "./system-art";

export function SystemScreen({
  title,
  accent,
  lead,
  actions,
  help,
  art,
  floor,
  titleActions = null,
  wordmarkInHead = false,
}: {
  /** The bold part of the H1: "Not on the". */
  title: string;
  /** The serif part, on its own line: "list.". */
  accent: string;
  lead: ReactNode;
  /** The ink pill, then at most one quiet link. */
  actions: ReactNode;
  /** One help line under the actions (and the reference, on the error page). */
  help?: ReactNode;
  art: SystemArtName;
  floor: "dock" | "own";
  /** The title row's actions (the member's photo, in the app). Null for none. */
  titleActions?: ReactNode | null;
  /** The app's maintenance page: no bar, so the wordmark sits at the top of the head. */
  wordmarkInHead?: boolean;
}) {
  return (
    <Main pad={false} className="sy-main">
      {/* The kit's title block (TitleBlock's markup), with room for the wordmark above the H1. */}
      <section className="sy-head">
        <div className="mk-wrap">
          <div className="mk-head">
            {wordmarkInHead ? (
              <div className="sy-wm-row">
                <Image src="/yuppie_logo_forte_forward.png" alt="Club Yuppie" width={1942} height={641} sizes="92px" loading="eager" />
              </div>
            ) : null}
            <div className="mk-row1">
              <div>
                <h1 className="mk-h1">
                  {title} <Serif>{accent}</Serif>
                </h1>
              </div>
              <div className="mk-actions">{titleActions}</div>
            </div>
            <p className="mk-lead">{lead}</p>
          </div>
        </div>
      </section>
      <section className={cn("sy-band", floor === "own" && "sy-floor")}>
        <div className="mk-wrap">
          <div className="sy-words">
            <div className="sy-acts">{actions}</div>
            {help}
          </div>
          <div className="sy-art" data-art={art}>
            <SystemArt name={art} />
          </div>
        </div>
      </section>
      {floor === "own" ? <div className="sy-strip" aria-hidden="true" /> : null}
    </Main>
  );
}

/** A help line: "Still stuck? Email hello@clubyuppie.com", with the reference under it when there is one. */
export function SystemHelp({ lead, email, reference }: { lead: string; email: string; reference?: string | null }) {
  return (
    <p className="sy-help">
      {lead}{" "}
      <a className="mk-inline-link" href={`mailto:${email}`}>
        {email}
      </a>
      {reference ? <span className="sy-ref">Reference {reference}</span> : null}
    </p>
  );
}
