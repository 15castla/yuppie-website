// Kit counterpart: k2.avatar(letter, s, cls, photo) and k2.avatars(letters,
// more, ring). A member is always a photo; the initial circle is only for the
// "no photo yet" moments (the photo gate off at launch, or a removed photo).
// Photos are plain <img> (member photos live in Supabase storage and the
// example ones are data URIs), never next/image.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { cssVars } from "./css-vars";

export type AvatarTone = "cream" | "pale";

export function initialOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().charAt(0);
  return first ? first.toLocaleUpperCase("en-GB") : "?";
}

export function Avatar({
  photoUrl,
  name,
  size = 44,
  tone,
  blank = false,
  className,
}: {
  /** The member's photo. Missing or empty: the initial of `name` in an ink circle. */
  photoUrl?: string | null;
  /** First name (or full name): only its first letter is drawn, and only without a photo. */
  name?: string | null;
  /** Pixels, width and height. 44 on the top row, 40 in the computer header, 28 in stacks, 64 in Who's in. */
  size?: number;
  tone?: AvatarTone;
  /** An empty cream circle: the slot while the photo is still arriving. */
  blank?: boolean;
  className?: string;
}) {
  const style = cssVars({ "--s": `${size}px` });
  if (blank) {
    return <span className={cn("mk-avatar mk-ph", className)} style={style} aria-hidden="true" />;
  }
  if (photoUrl) {
    return (
      <span className={cn("mk-avatar mk-ph", className)} style={style} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" width={size} height={size} />
      </span>
    );
  }
  return (
    <span
      className={cn("mk-avatar", tone === "cream" && "mk-cream", tone === "pale" && "mk-pale", className)}
      style={style}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}

export type AvatarStackItem = { photoUrl?: string | null; name?: string | null };

// Overlapping 28px photos with a 2px ring in the background colour, then an
// optional "+2" or "3 of 4 going" text.
export function AvatarStack({
  people,
  more,
  ring = "var(--yellow)",
}: {
  people: AvatarStackItem[];
  more?: ReactNode;
  /** The colour the 2px ring is drawn in: the colour the stack sits on (a card). */
  ring?: string;
}) {
  return (
    <span className="mk-avatars" style={cssVars({ "--ring": ring })}>
      {people.map((person, index) => (
        <Avatar
          key={index}
          photoUrl={person.photoUrl}
          name={person.name}
          size={28}
          tone={index % 2 ? "cream" : "pale"}
        />
      ))}
      {more ? <span className="mk-more">{more}</span> : null}
    </span>
  );
}
