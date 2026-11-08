// The loading views of Discounts and Access: the page's real title and line
// where they will be, nothing else. Since 7 Nov 2026 no route uses them (whole
// pages only: components/members/kit/main.tsx); kept for the preview harness.
// No spinner (the native app's splash waits for a <main> that is not aria-busy
// and no animate-spin).

import { Main, TitleBlock } from "@/components/members/kit";
import "./discounts.css";

export const DISCOUNTS_TITLE = {
  title: "Discounts.",
  sub: "Show your phone, pay less.",
  lead: "Tap an offer, then show the screen to the staff.",
} as const;

export const ACCESS_TITLE = {
  title: "Access.",
  sub: "Doors that open for you.",
  lead: "Tap one, then show the screen at the door.",
} as const;

export function DiscountsLoading() {
  return (
    <Main fill busy className="dc-main">
      <p className="mk-sr" role="status">
        Loading offers.
      </p>
      <TitleBlock title={DISCOUNTS_TITLE.title} sub={DISCOUNTS_TITLE.sub} />
    </Main>
  );
}

export function AccessLoading() {
  return (
    <Main fill busy className="dc-main">
      <p className="mk-sr" role="status">
        Loading access.
      </p>
      <div className="mk-wrap">
        {/* As the page draws it when it has a spotlight offer (beside the title from 768). */}
        <div className="dc-acc-top dc-has-spot">
          <div className="dc-acc-head">
            <TitleBlock title={ACCESS_TITLE.title} sub={ACCESS_TITLE.sub} />
          </div>
        </div>
      </div>
    </Main>
  );
}
