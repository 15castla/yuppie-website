// The queue pages' pieces (Reports and Photos: v3 msg-admin-moderation-1280 and photo-admin-*, framed in r2b 19):
// the four numbers under the title, the "nothing waiting" words, and the card's head. Presentational only.

import type { ReactNode } from "react";

import { MainBusy } from "./main-busy";
import { PageHead, Pill, Shape, type PillKind } from "./ui";

export type QueueStat = { label: string; value: string; late?: boolean };

/** The four numbers (Open reports, Oldest open, Review within, Removed this month). `late` reds a number past the 24-hour promise. */
export function QueueStats({ items, label }: { items: QueueStat[]; label: string }) {
  return (
    <dl className="ad-stats" aria-label={label}>
      {items.map((s) => (
        <div className="ad-stat" key={s.label}>
          <dt>{s.label}</dt>
          <dd className={s.late ? "late" : undefined}>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Nothing in the list (photo-admin-empty): the words take the width under a rule; no card beside them. */
export function QueueEmpty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ad-empty-wide ad-qempty" role="status">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

/** The card's head: the title ("Message from Ollie") and the status pill on the right. */
export function QueueCardHead({ id, title, pill, pillKind = "plain" }: { id: string; title: string; pill: string; pillKind?: PillKind }) {
  return (
    <div className="ad-qh">
      <h2 id={id} className="ad-h2">
        {title}
      </h2>
      <Pill kind={pillKind}>{pill}</Pill>
    </div>
  );
}

/** The head while its numbers load: the real title, lead and tab words, pale shapes for the numbers (B-D6). */
export function QueueHeadLoading({ title, lead, tabs, stats }: { title: string; lead: string; tabs: string[]; stats: string[] }) {
  return (
    <div aria-busy="true">
      <MainBusy />
      <PageHead
        title={title}
        lead={lead}
        right={
          <div className="ad-tabs seg" aria-hidden="true">
            {tabs.map((t, i) => (
              <span key={t} className={i === 0 ? "ad-segsk on" : "ad-segsk"}>
                {t}
              </span>
            ))}
          </div>
        }
      />
      <dl className="ad-stats" aria-hidden="true">
        {stats.map((label) => (
          <div className="ad-stat" key={label}>
            <dt>{label}</dt>
            <dd>
              <Shape style={{ width: 56, height: 32 }} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
