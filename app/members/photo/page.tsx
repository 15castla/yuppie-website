import { requireFlag } from "@/lib/members/flags";
import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { firstNameOf } from "@/lib/members/you/format";
import { PhotoGateView } from "@/components/members/photo/photo-gate-view";
import { signOutMember, updateAvatar } from "../profile/actions";
import { requireMember } from "../require-member";

// The photo gate: a full screen with no tab bar, shown until a photo is
// saved. Switched off (NEXT_PUBLIC_MEMBERS_PHOTO_GATE) until the photo
// storage is ready; off, this is a 404. It is the one page that must let a
// member with no photo in (requireMember's allowMissingPhoto), or the gate
// would redirect to itself. Saving goes through the existing updateAvatar.
export default async function MembersPhotoGatePage() {
  requireFlag("photoGate");
  const member = await requireMember({ allowMissingPhoto: true });
  const mode = await detectShellMode();

  return (
    <PhotoGateView
      mode={mode}
      firstName={firstNameOf(member.full_name)}
      hasPhoto={Boolean(member.avatar_url)}
      continueHref={landingPath()}
      upload={updateAvatar}
      signOut={signOutMember}
    />
  );
}
