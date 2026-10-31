import { flags } from "@/lib/members/flags";
import { currentPhotoUrl } from "@/lib/server/photos";
import { requireMember } from "../../require-member";
import { ProfileEditView } from "@/components/members/profile-edit-view";

export default async function MembersProfileEditPage() {
  const member = await requireMember();
  const showPhotoUpload = !flags.photoGate;
  // Stage 2: the photo row (gate off only) shows the private photo through a signed URL, never the old public
  // avatar_url (no longer written, and deleted later). The view reads it from the member's avatar_url field.
  const photoUrl = showPhotoUpload && member.photo_id ? await currentPhotoUrl(member.id, "full") : null;

  return <ProfileEditView member={{ ...member, avatar_url: photoUrl }} showPhotoUpload={showPhotoUpload} />;
}
