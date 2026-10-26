// The small pieces of the photo gate and Change photo: the dashed ring, the
// tips, the plain-words privacy line, the error and note boxes, the "how it
// looks" card, the progress bar and the gate's frame. Pure: props in, markup
// out (no fetching, no actions), so the preview harness draws every state.

import "./photo.css";

import type { ReactNode } from "react";

import { Avatar, Card, Icon, Main, cssVars, type IconName } from "@/components/members/kit";
import { PHOTO_ERRORS, type PhotoErrorKind } from "@/lib/members/photo/validate";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- the ring: the initial in a circle inside a dashed ring

export function PhotoRing({
  size = 168,
  letter,
  photoUrl,
  glyph,
  solid = false,
  cam = true,
  over = false,
}: {
  size?: number;
  /** The first name: its initial stands in until there is a photo. */
  letter?: string | null;
  photoUrl?: string | null;
  /** An icon in the circle instead of the initial (the camera screens). */
  glyph?: IconName;
  /** A solid ring with a tick instead of the camera badge (the photo is on). */
  solid?: boolean;
  /** The camera badge. */
  cam?: boolean;
  /** A photo is being dragged over the drop zone. */
  over?: boolean;
}) {
  const inner = size - 28;
  const r = size / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const count = Math.max(8, Math.round(circumference / 18));
  const unit = circumference / count;
  const dash = solid ? undefined : `${(unit * 0.5 - 2).toFixed(2)} ${(unit * 0.5 + 2).toFixed(2)}`;
  return (
    <span className={cn("ph-ring", over && "is-over")} style={cssVars({ "--s": `${size}px` })}>
      <svg className="ph-ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r.toFixed(2)}
          fill="none"
          style={{ stroke: "var(--ink)" }}
          strokeWidth={solid ? 3 : 2}
          strokeDasharray={dash}
          strokeLinecap="round"
        />
      </svg>
      <span className="ph-ring-in">
        {glyph ? (
          <span className="mk-avatar mk-pale ph-glyph" style={cssVars({ "--s": `${inner}px` })}>
            <Icon name={glyph} size={Math.floor(inner * 0.36)} />
          </span>
        ) : (
          <Avatar photoUrl={photoUrl} name={letter} size={inner} tone="pale" />
        )}
      </span>
      {cam ? (
        <span className="ph-cam" aria-hidden="true">
          <Icon name="camera" size={20} />
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------- words

const TIPS: { icon: IconName; text: string }[] = [
  { icon: "scan-face", text: "A clear photo of your face" },
  { icon: "user", text: "Just you, no group shots" },
  { icon: "sun", text: "Good light, facing the camera" },
];

export function Tips() {
  return (
    <ul className="ph-tips">
      {TIPS.map((tip) => (
        <li key={tip.text}>
          <Icon name={tip.icon} size={20} />
          <span>{tip.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function PrivacyNote() {
  return (
    <p className="ph-priv">
      <Icon name="lock" size={18} />
      <span>Only members who are logged in can see your photo. It’s never public.</span>
    </p>
  );
}

// An error from the checks or the upload: what happened in bold, then what to do.
export function PhotoError({ kind }: { kind: PhotoErrorKind }) {
  const error = PHOTO_ERRORS[kind];
  return (
    <p className="ph-err" role="alert">
      <Icon name="circle-alert" size={20} />
      <span>
        <b>{error.title}</b> {error.text.replace(/10 MB/, "10 MB")}
      </span>
    </p>
  );
}

// The soft notes: "We removed your last photo." and the no-face check.
export function NoteBox({ title, text, icon = "scan-face", top = false }: { title: string; text: string; icon?: IconName; top?: boolean }) {
  return (
    <div className={cn("ph-warn", top && "is-top")} role="alert">
      <Icon name={icon} size={22} />
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
    </div>
  );
}

// "How it looks": the photo at the three sizes members see it.
export function SizesCard({ photoUrl, name }: { photoUrl: string | null; name?: string | null }) {
  return (
    <Card className="ph-prev">
      <span className="mk-term">How it looks</span>
      <div className="ph-sizes">
        <figure>
          <Avatar photoUrl={photoUrl} name={name} size={96} />
          <figcaption>On You</figcaption>
        </figure>
        <figure>
          <Avatar photoUrl={photoUrl} name={name} size={48} />
          <figcaption>In chats</figcaption>
        </figure>
        <figure>
          <Avatar photoUrl={photoUrl} name={name} size={28} />
          <figcaption>Who’s in</figcaption>
        </figure>
      </div>
    </Card>
  );
}

// The save is one server action that reports no progress, so the bar says
// what is happening and never a percentage.
export function SavingBar() {
  return (
    <div className="ph-prog" role="status">
      <div className="ph-r">
        <span>Saving your photo</span>
      </div>
      <div className="ph-bar" aria-hidden="true">
        <i />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the gate's frame

// Full screen, no tab bar, no photo top right (you are not in yet). The words
// and the stage share a grid: stacked on a phone with the buttons in a docked
// bar at the foot, two columns from 768px with the buttons under the words.
// `bar` is the web gate bar (wordmark and Log out); `topLink` is Log out in the
// app, top right under the status area.
export function GateFrame({
  bar,
  topLink,
  h1,
  small = false,
  sub,
  subSerif = true,
  stage,
  wordsExtra,
  acts,
  actsDesk,
  req = true,
  pair = false,
  removed = false,
}: {
  bar?: ReactNode;
  topLink?: ReactNode;
  h1: ReactNode;
  /** The smaller headline of the second and later steps. */
  small?: boolean;
  sub?: ReactNode;
  /** A serif subline, else a plain lead sentence. */
  subSerif?: boolean;
  stage: ReactNode;
  wordsExtra?: ReactNode;
  /** The buttons: in the docked bar on a phone, under the words from 768px (unless `actsDesk` says otherwise). */
  acts: ReactNode;
  /** The buttons under the words from 768px. Null: none (the drop zone is the button). */
  actsDesk?: ReactNode | null;
  /** "You need a photo to use Club Yuppie." above the docked buttons. */
  req?: boolean;
  /** Two buttons side by side on a short phone. */
  pair?: boolean;
  /** The "we removed your last photo" start screen: the ring goes on a short phone. */
  removed?: boolean;
}) {
  const desk = actsDesk === undefined ? acts : actsDesk;
  return (
    <>
      {bar}
      <Main pad={false} className={cn("yu-main ph-main", removed && "ph-removed")}>
        <div className="mk-wrap">
          <div className="mk-head ph-head">
            {topLink}
            <div className="ph-grid">
              <div className="ph-words">
                <h1 className={cn("mk-h1", small ? "ph-h1-sm" : "ph-h1")}>{h1}</h1>
                {sub ? subSerif ? <p className="mk-sub-serif">{sub}</p> : <p className="mk-lead ph-lead">{sub}</p> : null}
                {wordsExtra}
                {desk ? <div className="ph-acts ph-acts-desk mk-show-desk">{desk}</div> : null}
              </div>
              <div className="ph-stage">{stage}</div>
            </div>
          </div>
        </div>
      </Main>
      <div className="ph-dock mk-show-phone" data-needs-device-check="true">
        {req ? <p className="ph-req">You need a photo to use Club Yuppie.</p> : null}
        <div className={cn("ph-acts", pair && "ph-pair")}>{acts}</div>
      </div>
    </>
  );
}
