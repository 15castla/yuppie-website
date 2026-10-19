// The public website's line drawings and small icons, copied from the
// approved boards (design-ref/boards/DHome.dc.html). Ink strokes with
// yellow fills, drawn on a 200x200 grid; pass `size` for the rendered
// width and height. Decorative unless a `label` is given.

import type { ReactNode, SVGProps } from "react";

const INK = "#1B1512";
const YELLOW = "#FFD904";

type DrawingProps = {
  size: number;
  // Stroke width in the 200-unit grid: 3 on desktop, 3.5 on the 64px
  // mobile perk icons.
  strokeWidth?: number;
  // An accessible name makes it an image (role="img"); without one it's
  // hidden from assistive tech.
  label?: string;
} & Omit<SVGProps<SVGSVGElement>, "children">;

function Drawing({ size, strokeWidth = 3, label, children, ...rest }: DrawingProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      stroke={INK}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...rest}
    >
      {children}
    </svg>
  );
}

function Coupe() {
  return (
    <g transform="rotate(-14 75 152) translate(-6 6)">
      <path d="M38,78 C38,112 112,112 112,78 Z" fill={YELLOW} />
      <path d="M45,88 C62,97 88,97 105,88" />
      <path d="M75,106 L75,152" />
      <path d="M53,156 C60,150 90,150 97,156 Z" />
    </g>
  );
}

// Two champagne coupes clinking (Events).
export function CoupesDrawing(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <Coupe />
      <g transform="translate(200 0) scale(-1 1)">
        <Coupe />
      </g>
      <path d="M100,40 L100,24" />
      <path d="M84,46 L76,32" />
      <path d="M116,46 L124,32" />
    </Drawing>
  );
}

// A price tag (Discounts).
export function PriceTagDrawing(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <g transform="rotate(-18 100 100)">
        <path d="M40,64 L124,64 L166,100 L124,136 L40,136 Z" fill={YELLOW} />
        <circle cx="138" cy="100" r="6" />
        <circle cx="66" cy="86" r="7" />
        <circle cx="96" cy="114" r="7" />
        <path d="M98,82 L64,118" />
      </g>
      <path d="M146,86 C168,70 176,46 164,30" />
    </Drawing>
  );
}

// A velvet rope between two posts (Access).
export function VelvetRopeDrawing(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <path d="M50,92 C80,140 120,140 150,92" strokeWidth={9} />
      <path d="M36,74 L36,168" />
      <path d="M46,74 L46,168" />
      <circle cx="41" cy="64" r="10" fill={YELLOW} />
      <path d="M18,176 C22,166 60,166 64,176 Z" fill={YELLOW} />
      <path d="M154,74 L154,168" />
      <path d="M164,74 L164,168" />
      <circle cx="159" cy="64" r="10" fill={YELLOW} />
      <path d="M136,176 C140,166 178,166 182,176 Z" fill={YELLOW} />
    </Drawing>
  );
}

const PHONE_KEY_ROWS = [104, 117, 130, 143];
const PHONE_KEY_COLUMNS = [81, 95, 109];

// An 80s brick phone (Concierge, and the contact page).
export function BrickPhoneDrawing(props: DrawingProps) {
  return (
    <Drawing {...props}>
      <rect x="80" y="12" width="14" height="30" rx="5" />
      <rect x="68" y="38" width="64" height="148" rx="10" fill={YELLOW} />
      <path d="M88,54 L112,54" />
      <path d="M88,61 L112,61" />
      <rect x="81" y="72" width="38" height="20" rx="3" fill={INK} />
      {PHONE_KEY_ROWS.map((y) =>
        PHONE_KEY_COLUMNS.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="7" rx="2" />),
      )}
      <path d="M90,168 L110,168" />
    </Drawing>
  );
}

const STRING_COLUMNS = [78, 87, 96, 105, 114, 123];
const STRING_ROWS = [34, 43, 52, 61, 70, 79, 88, 97];

function Racket({ angle, clipId }: { angle: number; clipId: string }) {
  return (
    <g transform={`rotate(${angle} 100 150)`}>
      <ellipse cx="100" cy="62" rx="27" ry="36" fill={YELLOW} />
      <g clipPath={`url(#${clipId})`} strokeWidth={1.6}>
        {STRING_COLUMNS.map((x) => (
          <path key={`v${x}`} d={`M${x},20 L${x},104`} />
        ))}
        {STRING_ROWS.map((y) => (
          <path key={`h${y}`} d={`M70,${y} L130,${y}`} />
        ))}
      </g>
      <path d="M88,95 L96,120 L104,120 L112,95" />
      <rect x="94" y="118" width="12" height="52" rx="4" fill={YELLOW} />
    </g>
  );
}

// Two crossed tennis rackets and a ball, over the Open Invite card.
// `clipId` must be unique on the page (it names the strings' clip path).
export function TennisRacketsDrawing({ clipId, ...props }: DrawingProps & { clipId: string }) {
  return (
    <Drawing {...props}>
      <defs>
        <clipPath id={clipId}>
          <ellipse cx="100" cy="62" rx="25" ry="34" />
        </clipPath>
      </defs>
      <Racket angle={-28} clipId={clipId} />
      <Racket angle={28} clipId={clipId} />
      <circle cx="100" cy="176" r="13" fill={YELLOW} />
      <path d="M89,169 C96,174 96,180 90,186" />
      <path d="M111,166 C104,171 104,181 111,186" />
    </Drawing>
  );
}

// The right arrow on navigational CTAs ("Apply for membership").
export function ArrowRightIcon({ width = 18, height = 12 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 18 12" fill="none" aria-hidden className="shrink-0">
      <path d="M0 6h16M11 1l5 5-5 5" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The phone bar's "Menu" and "Close" icons: 18x12, stroke 2, round caps.
export function MenuLinesIcon() {
  return (
    <svg width={18} height={12} viewBox="0 0 18 12" fill="none" aria-hidden className="shrink-0">
      <path d="M1 1h16M1 6h16M1 11h16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export function CloseXIcon() {
  return (
    <svg width={18} height={12} viewBox="0 0 18 12" fill="none" aria-hidden className="shrink-0">
      <path d="M4 1l10 10M14 1L4 11" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

// The padlock beside "Payment details" on /apply.
export function LockIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <rect x="3.5" y="9" width="13" height="8.5" rx="2" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  );
}
