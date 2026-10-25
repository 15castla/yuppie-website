// The loading states of Discounts and Access (design: v3 specs/discounts-access.md,
// section C): the page's real title block, then pale shapes the size of what
// will arrive, so nothing jumps. Static: no shimmer, no spinner (the native
// app's splash waits for a <main> that is not aria-busy and no animate-spin).
// Used by the routes' loading.tsx files and by the preview harness.

import { Card, Main, TitleBlock } from "@/components/members/kit";
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

// Widths in per cent of the row, so the placeholder lines differ a little row to row.
const ROW_WIDTHS: [number, number, number][] = [
  [58, 86, 44],
  [66, 74, 40],
  [52, 90, 48],
  [62, 80, 42],
  [56, 70, 46],
];

function RowShapes({ rows, pills }: { rows: number; pills: boolean }) {
  return (
    <ul className="dc-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => {
        const [name, offer, meta] = ROW_WIDTHS[index % ROW_WIDTHS.length];
        return (
          <li key={index}>
            <div className="dc-row dc-sk-row">
              <span className="dc-tile" />
              <i className="mk-sk dc-sk-name" style={{ width: `${name}%` }} />
              {pills && index !== 3 ? <i className="mk-sk dc-sk-pill" /> : null}
              <i className="mk-sk dc-sk-offer" style={{ width: `${offer}%` }} />
              <i className="mk-sk dc-sk-meta" style={{ width: `${meta}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DiscountsLoading() {
  return (
    <Main fill busy className="dc-main">
      <TitleBlock {...DISCOUNTS_TITLE} />
      <div className="mk-wrap">
        <div className="dc-chips">
          <div className="mk-chips dc-sk-chips" aria-hidden="true">
            {[58, 128, 92, 108].map((width) => (
              <i key={width} className="mk-sk" style={{ width }} />
            ))}
          </div>
        </div>
      </div>
      <div className="mk-wrap">
        <section className="dc-sec" aria-label="Offers">
          <p className="mk-sr" role="status">
            Loading offers.
          </p>
          <div className="dc-sk-month" aria-hidden="true">
            <i className="mk-sk dc-sk-h" />
            <i className="mk-sk dc-sk-c" />
          </div>
          <RowShapes rows={5} pills />
        </section>
      </div>
    </Main>
  );
}

export function AccessLoading() {
  return (
    <Main fill busy className="dc-main">
      <div className="mk-wrap">
        <div className="dc-acc-top dc-has-spot">
          <div className="dc-acc-head">
            <TitleBlock {...ACCESS_TITLE} />
          </div>
          <div className="dc-acc-spot" aria-hidden="true">
            <div className="dc-spot-wrap">
              {/* The rope's height, so the card does not jump when it arrives. */}
              <div className="dc-sk-stand" />
              <Card as="div" className="dc-spot dc-sk-card">
                <i className="mk-sk dc-sk-lab" />
                <i className="mk-sk dc-sk-title" />
                <i className="mk-sk dc-sk-line" />
                <i className="mk-sk dc-sk-btn" />
              </Card>
            </div>
          </div>
        </div>
      </div>
      <div className="mk-wrap">
        <div className="dc-ksecs">
          <p className="mk-sr" role="status">
            Loading access.
          </p>
          {[0, 1].map((section) => (
            <section key={section} className="dc-ksec" aria-hidden="true">
              <div className="dc-sk-month">
                <i className="mk-sk dc-sk-h" />
              </div>
              <RowShapes rows={2} pills={false} />
            </section>
          ))}
        </div>
      </div>
    </Main>
  );
}
