import { flags, requireFlag } from "@/lib/members/flags";
import { returnPath } from "@/lib/members/photo/return-path";
import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { firstNameOf } from "@/lib/members/you/format";
import { photosPrivateDone } from "@/lib/server/config";
import { photoGateState } from "@/lib/server/photos";
import { PhotoGateView } from "@/components/members/photo/photo-gate-view";
import { signOutMember } from "../profile/actions";
import { uploadMyPhoto } from "./actions";
import { requireMember } from "../require-member";

// The photo gate: a full screen with no tab bar, shown until a photo is saved (members.photo_id: none yet, or the
// club removed it). Switched off with NEXT_PUBLIC_MEMBERS_PHOTO_GATE; off, this is a 404. It is the one page that
// must let a member with no photo in (requireMember's allowMissingPhoto), or the gate would redirect to itself.
// Saving goes to the private bucket (./actions.ts uploadMyPhoto, with the browser's face check). The removed
// notice (with the reason the admin picked) and the "existing member" line come from photoGateState. Continue goes
// back to the page the gate stopped them on (?next=, set by requireMember), or the landing page.
export default async function MembersPhotoGatePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  requireFlag("photoGate");
  const member = await requireMember({ allowMissingPhoto: true });
  const [mode, gate, query] = await Promise.all([detectShellMode(), photoGateState(member), searchParams]);
  // Continue: back to the page the gate stopped them on (a members page on this site only), else the landing page.
  const next = returnPath(typeof query.next === "string" ? query.next : null);
  // "It’s never public." only once the old public copies are deleted (release/delete-public-avatars.mjs, then the
  // server-only switch MEMBERS_PHOTOS_PRIVATE_DONE=on: lib/server/config.ts).
  const neverPublic = photosPrivateDone();

  return (
    <PhotoGateView
      mode={mode}
      firstName={firstNameOf(member.full_name)}
      hasPhoto={gate.hasPhoto}
      continueHref={next ?? landingPath(flags, mode)}
      upload={uploadMyPhoto}
      signOut={signOutMember}
      gate={{ removed: gate.removed?.reason ?? null, existing: gate.existing }}
      neverPublic={neverPublic}
    />
  );
}
