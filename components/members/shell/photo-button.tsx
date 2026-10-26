"use client";

// Kit counterpart: k2.me_btn(active). Your photo, 44px with a 2px ink ring,
// top right of every main page. It opens You. It is never a tab: no tab is
// lit on You. The slot is a fixed 44px, so nothing moves when the member's
// photo arrives; until then it is an empty cream ring. With no photo yet (the
// photo gate is off at launch) it is the member's initial in an ink circle.
// On You and its sub pages it is the current page and draws the double ring.

import { Suspense } from "react";

import { Avatar } from "../kit/avatar";
import { KitLink } from "../kit/link";
import { ROUTES } from "@/lib/members/routes";
import { useMember, useShell } from "./shell-context";
import type { MemberSummary } from "./types";

// Pure: the member as a value.
export function PhotoButton({
  member,
  current = false,
}: {
  /** null: the slot, empty (still loading, or not known). */
  member: MemberSummary | null;
  current?: boolean;
}) {
  return (
    <KitLink
      href={ROUTES.you}
      className="mk-me-btn"
      aria-label="You, your profile"
      aria-current={current ? "page" : undefined}
    >
      {member ? (
        <Avatar photoUrl={member.photoUrl} name={member.firstName} size={44} />
      ) : (
        <Avatar blank size={44} />
      )}
    </KitLink>
  );
}

function ShellPhotoButtonInner() {
  const member = useMember();
  const { youCurrent } = useShell();
  return <PhotoButton member={member} current={youCurrent} />;
}

// The shell's: reads the member (a value or a streamed promise) and whether
// You is the current page from the frame.
export function ShellPhotoButton() {
  const { youCurrent } = useShell();
  return (
    <Suspense fallback={<PhotoButton member={null} current={youCurrent} />}>
      <ShellPhotoButtonInner />
    </Suspense>
  );
}
