// Loading state: pale (#FFF3B0) shapes where the content will be. Static: no
// shimmer, no spinner. The native app's splash waits for a real <main> with
// no "animate-spin" on the page, so a page's loading state is
// <Main busy><LoadingShapes ... /></Main>. Keep each shape the size of what
// it stands for so nothing jumps when the page arrives.
//
// Shape draws one block; the rest are the shapes the members pages need.
// Kit counterpart: the .sk blocks of the area designs (disc.css), which are
// plain pale rectangles with an 8px radius.

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Shape({
  width,
  height,
  kind = "bar",
  className,
  style,
}: {
  width?: number | string;
  height: number | string;
  kind?: "bar" | "pill" | "disc" | "tile";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <i
      aria-hidden="true"
      className={cn(
        "mk-sk",
        kind === "pill" && "mk-sk-pill",
        kind === "disc" && "mk-sk-disc",
        kind === "tile" && "mk-sk-tile",
        className,
      )}
      style={{ width, height, ...style }}
    />
  );
}

// One ruled row: a 44px date block, two lines, a pill. The Events list's shape.
export function RowShape({ lines = [58, 38] }: { lines?: [number, number] | number[] }) {
  return (
    <div className="mk-row" aria-hidden="true" style={{ pointerEvents: "none" }}>
      <Shape width={44} height={44} kind="tile" />
      <span className="mk-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shape width={`${lines[0]}%`} height={16} />
        <Shape width={`${lines[1] ?? 38}%`} height={13} />
      </span>
      <span className="mk-end">
        <Shape width={80} height={22} kind="pill" />
      </span>
    </div>
  );
}

// A whole page's worth of shapes: title row (the real words are better when
// you have them: pass them as `title`), a chip row, and n ruled rows.
export function LoadingShapes({
  rows = 5,
  chips = false,
  title,
  label = "Loading",
  children,
}: {
  rows?: number;
  chips?: boolean;
  /** The page's real title block, when the loading page knows it. Else a bar. */
  title?: ReactNode;
  /** Read out by screen readers. */
  label?: string;
  children?: ReactNode;
}) {
  const widths = [
    [58, 38],
    [66, 34],
    [52, 42],
    [62, 36],
    [56, 40],
  ];
  return (
    <>
      <span className="mk-sr">{label}</span>
      {title ?? (
        <div className="mk-wrap">
          <div className="mk-head">
            <Shape width="58%" height={44} />
            <Shape width="42%" height={26} style={{ marginTop: 12 }} />
          </div>
        </div>
      )}
      <div className="mk-wrap">
        {chips ? (
          <div style={{ display: "flex", gap: 8, marginTop: 28, overflow: "hidden" }} aria-hidden="true">
            {[72, 112, 96, 88].map((w) => (
              <Shape key={w} width={w} height={44} kind="pill" style={{ flex: "none" }} />
            ))}
          </div>
        ) : null}
        <div className="mk-section mk-first">
          <Shape width={132} height={30} style={{ marginBottom: 14 }} />
          <div className="mk-rows">
            {Array.from({ length: rows }, (_, i) => (
              <RowShape key={i} lines={widths[i % widths.length]} />
            ))}
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
