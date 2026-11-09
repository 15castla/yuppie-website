"use client";

// Tap a member's photo to see it bigger (Albert, 8 Nov 2026: "You should be able to click on someones profile
// picture and make it larger"). The avatar becomes a button; it opens the members' dialog (a bottom sheet on a
// phone, a centred modal on a computer) with the photo large and their first name. The page's small photo shows at
// once, and the full-size one (largeMemberPhoto) replaces it when it arrives. No photo (the initial only): a plain
// avatar, nothing to open. Not used where the avatar already sits in a link or a button (rows, cards).

import "@/components/members/you/you.css";
import "./photo.css";

import { useId, useState } from "react";

import { largeMemberPhoto } from "@/app/members/photo/actions";
import { Avatar, Button, type AvatarTone } from "@/components/members/kit";
import { Dialog } from "@/components/members/you/dialog";

export type ZoomPerson = { id: string; firstName: string; photoUrl: string | null };

export function ZoomAvatar({
  person,
  size,
  tone,
  className,
}: {
  /** Null or a missing photo: the plain avatar (an initial), nothing to open. */
  person: ZoomPerson | null | undefined;
  size?: number;
  tone?: AvatarTone;
  className?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [large, setLarge] = useState<string | null>(null);

  if (!person?.photoUrl) {
    return <Avatar photoUrl={null} name={person?.firstName} size={size} tone={tone} className={className} />;
  }
  const { id, firstName, photoUrl } = person;

  function show() {
    setOpen(true);
    if (large) return;
    largeMemberPhoto(id)
      .then((url) => {
        if (url) setLarge(url);
      })
      .catch(() => {
        // The small photo stays: nothing to say.
      });
  }

  return (
    <>
      <button type="button" className="mk-zoom" aria-label={`See ${firstName}’s photo`} onClick={show}>
        <Avatar photoUrl={photoUrl} name={firstName} size={size} tone={tone} className={className} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="ph-zoom">
          <span className="ph-zoom-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={large ?? photoUrl} alt="" />
          </span>
          <h2 className="mk-h2" id={titleId}>
            {firstName}
          </h2>
          <Button block variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>
    </>
  );
}
