import { flags } from "@/lib/members/flags";
import { requireMember } from "../../require-member";
import { ProfileEditView } from "@/components/members/profile-edit-view";

export default async function MembersProfileEditPage() {
  const member = await requireMember();

  return <ProfileEditView member={member} showPhotoUpload={!flags.photoGate} />;
}
