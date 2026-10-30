import { flags, requireFlag } from "@/lib/members/flags";
import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { firstNameOf } from "@/lib/members/you/format";
import { PhotoGateView } from "@/components/members/photo/photo-gate-view";
import { signOutMember } from "../profile/actions";
import { uploadMyPhoto } from "./actions";
import { requireMember } from "../require-member";

// The photo gate: a full screen with no tab bar, shown until a photo is
// saved. Switched off (NEXT_PUBLIC_MEMBERS_PHOTO_GATE) until the photo
// storage is ready; off, this is a 404. It is the one page that must let a
// member with no photo in (requireMember's allowMissingPhoto), or the gate
// would redirect to itself. Stage 2: the gate is members.photo_id (none yet, or the club removed it); saving goes
// to the private bucket (./actions.ts uploadMyPhoto, with the face check). The removed notice and the
// "existing member" line come from getMyPhotoGate() (lib/server/photos photoGateState): the screen agent adds
// them to the view.
export default async function MembersPhotoGatePage() {
  requireFlag("photoGate");
  const member = await requireMember({ allowMissingPhoto: true });
  const mode = await detectShellMode();

  return (
    <PhotoGateView
      mode={mode}
      firstName={firstNameOf(member.full_name)}
      hasPhoto={Boolean(member.photo_id)}
      continueHref={landingPath(flags, mode)}
      upload={uploadMyPhoto}
      signOut={signOutMember}
    />
  );
}
