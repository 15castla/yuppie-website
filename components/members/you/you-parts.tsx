// The small pieces of the You page and its sub pages. Pure: props in, markup
// out (no fetching, no cookies, no actions), so the preview harness draws them
// with example data.

import Image from "next/image";

import { Avatar, BackLink, BackRow, Button, Icon, Row, Rows, SectionTitle, TitleBlock } from "@/components/members/kit";
import { ROUTES } from "@/lib/members/routes";
import type { SettingsRow } from "@/lib/members/you/types";

// The photo block: your photo at 96px, a plain line about who sees it, and
// Change photo (only when the photo gate flag is on; the link opens the
// Change photo sheet at /members/you/photo).
export function PhotoBlock({ photoUrl, name, changeHref }: { photoUrl: string | null; name: string; changeHref?: string | null }) {
  return (
    <div className="yu-photo">
      <Avatar photoUrl={photoUrl} name={name} size={96} />
      <div className="yu-photo-txt">
        <p>Only members who are logged in can see it.</p>
        {changeHref ? (
          <Button href={changeHref} variant="outline" size="sm" icon={<Icon name="camera" size={18} />}>
            Change photo
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// One whole-row link with a chevron: a Settings row (title and a one or two
// line summary) or a Help row (title only).
export function NavRow({ href, title, lines, warn }: { href: string; title: string; lines?: string[]; warn?: boolean }) {
  const meta = lines?.length ? (
    <span className={warn ? "yu-warn" : undefined}>
      {lines.map((line, index) => (
        <span key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </span>
  ) : undefined;
  return <Row href={href} className="yu-nav" title={title} meta={meta} end={<Icon name="chevron-right" size={20} />} />;
}

// "Your details": a label over its value. An empty value says so in words.
export function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  return (
    <div className="mk-row yu-kv">
      <span className="mk-body">
        <span className="yu-k">{label}</span>
        <span className={text ? "yu-v" : "yu-v yu-none"}>{text || "Not added"}</span>
      </span>
    </div>
  );
}

export function SettingsGroup({ rows }: { rows: SettingsRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mk-section">
      <SectionTitle title="Settings" />
      <Rows>
        {rows.map((row) => (
          <NavRow key={row.key} href={row.href} title={row.title} lines={row.lines} warn={row.warn} />
        ))}
      </Rows>
    </section>
  );
}

export function HelpGroup() {
  return (
    <section className="mk-section">
      <SectionTitle title="Help" />
      <Rows>
        <NavRow href={ROUTES.youHelpFaq} title="FAQs" />
        <NavRow href={ROUTES.youHelpContact} title="Contact us" />
        <NavRow href={ROUTES.youHelpPrivacy} title="Privacy policy" />
      </Rows>
    </section>
  );
}

// The giant wordmark standing on a 3px rule, and the legal line under it:
// the public footer's own drawing and the same ink crop (components/site/
// home.tsx), so the lettering runs edge to edge of the container.
const WORDMARK_INK = { left: 16, top: 16, width: 1911, height: 610 };
const WORDMARK_FILE = { width: 1942, height: 641 };

export function YouFoot({ legal, appVersion }: { legal: string[]; appVersion?: string | null }) {
  return (
    <footer className="yu-foot">
      <div className="mk-wrap">
        <span
          role="img"
          aria-label="Club Yuppie"
          className="yu-wm"
          style={{ aspectRatio: `${WORDMARK_INK.width} / ${WORDMARK_INK.height}` }}
        >
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt=""
            width={WORDMARK_FILE.width}
            height={WORDMARK_FILE.height}
            sizes="(min-width: 1240px) 1180px, 100vw"
            style={{
              width: `${(WORDMARK_FILE.width / WORDMARK_INK.width) * 100}%`,
              height: `${(WORDMARK_FILE.height / WORDMARK_INK.height) * 100}%`,
              left: `${(-WORDMARK_INK.left / WORDMARK_INK.width) * 100}%`,
              top: `${(-WORDMARK_INK.top / WORDMARK_INK.height) * 100}%`,
            }}
          />
        </span>
      </div>
      <hr className="yu-rule" />
      <div className="mk-wrap">
        <p className="yu-legal">
          <span>{legal.join(" ")}</span>
          {appVersion ? <span>App version {appVersion}</span> : null}
        </p>
      </div>
    </footer>
  );
}

// Every You sub page's head: the back row (the phone bar, and under the
// status area in the app), a "You" crumb above the title from 768px, then
// the title block with no actions (the back row replaces your photo here).
export function SubPageHead({
  title,
  sub,
  lead,
  backHref = ROUTES.you,
  backLabel = "You",
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  lead?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <>
      <BackRow href={backHref} label={backLabel} />
      <div className="mk-wrap yu-subhead">
        <div className="yu-crumb">
          <BackLink href={backHref} label={backLabel} />
        </div>
      </div>
      <TitleBlock title={title} sub={sub} lead={lead} actions={null} />
    </>
  );
}
