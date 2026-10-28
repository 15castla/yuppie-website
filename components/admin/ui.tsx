// The admin console's pieces (r2b Part 3, the "one grammar"): page head, tabs, the list | card grid, the card,
// pills, avatars, definition lists, sections, banners, receipts, the saved line and pale loading shapes.
// Presentational only (no data, no "use client"): pages and client components put them together.
// Styles: app/admin/admin.css (ad- classes).

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Icon, type AdminIconName } from "./icons";
import { cn } from "@/lib/utils";

export { Icon, type AdminIconName };

/** The page's <main>. Loading pages pass busy: aria-busy, and a screen-reader-only "Loading" (B-D6). */
export function AdminMain({ busy = false, children, className }: { busy?: boolean; children: ReactNode; className?: string }) {
  return (
    <main className={cn("ad-main", className)} aria-busy={busy || undefined}>
      <div className="ad-wrap">
        {busy && <span className="ad-sr">Loading</span>}
        {children}
      </div>
    </main>
  );
}

export function PageHead({ title, lead, right }: { title: string; lead?: ReactNode; right?: ReactNode }) {
  return (
    <div className="ad-head">
      <div>
        <h1 className="ad-h1">{title}</h1>
        {lead && <p className="ad-lead">{lead}</p>}
      </div>
      {right}
    </div>
  );
}

export type TabItem = { href: string; label: string; count?: number | null; current: boolean };

/** Link tabs (the design's .r2b-a-tabs): Waiting | Approved | Declined, Details | Attendees. */
export function Tabs({ items, label, className }: { items: TabItem[]; label: string; className?: string }) {
  return (
    <nav className={cn("ad-tabs", className)} aria-label={label}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.current ? "page" : undefined} scroll={false}>
          {t.label}
          {typeof t.count === "number" && <span className="n">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Card({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={cn("ad-card", className)} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export type PillKind = "plain" | "ink" | "muted" | "err";

export function Pill({ kind = "plain", children }: { kind?: PillKind; children: ReactNode }) {
  return <span className={cn("ad-pill", kind !== "plain" && kind)}>{children}</span>;
}

/** The membership status pill: Active (ink), Paused (outline), Cancelled (muted). */
export function StatusPill({ status }: { status: string }) {
  if (status === "paused") return <Pill>Paused</Pill>;
  if (status === "cancelled") return <Pill kind="muted">Cancelled</Pill>;
  return <Pill kind="ink">Active</Pill>;
}

export function initialOf(name: string | null | undefined, fallback = "?"): string {
  const ch = name?.trim().charAt(0);
  return ch ? ch.toUpperCase() : fallback;
}

/** A person: their photo when there is one, else the first letter on ink. */
export function Avatar({ name, photoUrl, size = 44 }: { name: string; photoUrl?: string | null; size?: number }) {
  const style = { "--s": `${size}px` } as CSSProperties;
  return (
    <span className="ad-avatar" style={style} aria-hidden="true">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}

export function DateCol({ weekday, day }: { weekday: string; day: string }) {
  return (
    <span className="ad-date" aria-hidden="true">
      <span className="wd">{weekday}</span>
      <span className="dn">{day}</span>
    </span>
  );
}

export type DLRow = [label: string, value: ReactNode | null | undefined];

/** Label | value rows; an empty value reads "Not given". */
export function DL({ rows, className }: { rows: DLRow[]; className?: string }) {
  return (
    <dl className={cn("ad-dl", className)}>
      {rows.map(([label, value]) => {
        const empty = value === null || value === undefined || value === "";
        return (
          <div key={label} style={{ display: "contents" }}>
            <dt>{label}</dt>
            <dd className={empty ? "empty" : undefined}>{empty ? "Not given" : value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Section({
  title,
  hint,
  right,
  children,
  plain = false,
  danger = false,
  id,
}: {
  title?: string;
  hint?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  plain?: boolean;
  danger?: boolean;
  id?: string;
}) {
  return (
    <section className={cn("ad-sec", plain && "plain")} aria-labelledby={id}>
      {title && (
        <div className="ad-st">
          <h3 id={id} className={danger ? "danger" : undefined}>
            {title}
          </h3>
          {right}
        </div>
      )}
      {hint && <p className="ad-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Receipt({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ad-receipt" role="status">
      <Icon name="circle-check" size={22} />
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

export function SavedLine({ children }: { children: ReactNode }) {
  return (
    <p className="ad-saved" role="status">
      <Icon name="circle-check" size={20} />
      <span>{children}</span>
    </p>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="ad-errline" role="alert">
      <Icon name="circle-alert" size={18} />
      <span>{children}</span>
    </p>
  );
}

export function Shape({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn("ad-sk", className)} style={style} aria-hidden="true" />;
}

/** The loading list: rows of pale shapes. */
export function ListShapes({ rows = 6, lead = "cir" }: { rows?: number; lead?: "cir" | "date" | "tile" }) {
  const widths: [number, number][] = [
    [52, 70],
    [44, 62],
    [58, 66],
    [40, 58],
    [50, 72],
    [46, 60],
  ];
  return (
    <div className="ad-q" aria-hidden="true">
      {widths.slice(0, rows).map(([a, b], i) => (
        <div key={i} className="ad-item">
          <span className="lead">
            <Shape className={lead === "cir" ? "cir" : undefined} style={{ width: lead === "date" ? 36 : 44, height: 44 }} />
          </span>
          <span>
            <Shape style={{ width: `${a}%`, height: 15 }} />
            <Shape style={{ width: `${b}%`, height: 13, marginTop: 8 }} />
          </span>
          <span className="end">
            <Shape className="rnd" style={{ width: 64, height: 22 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** The loading card: a head and rows of shapes, yellow inside the pale card. */
export function CardShapes({ avatar = true }: { avatar?: boolean }) {
  return (
    <div className="ad-card" aria-hidden="true">
      <div className="ad-dh">
        {avatar && <Shape className="cir" style={{ width: 56, height: 56 }} />}
        <div className="tt">
          <Shape style={{ width: "50%", height: 28 }} />
          <Shape style={{ width: "34%", height: 14, marginTop: 8 }} />
        </div>
      </div>
      {[62, 48, 70, 40, 56].map((w) => (
        <div key={w} style={{ marginTop: 18 }}>
          <Shape style={{ width: `${w}%`, height: 15 }} />
        </div>
      ))}
      <div style={{ marginTop: 26 }}>
        <Shape style={{ height: 120 }} />
      </div>
    </div>
  );
}
