import { requireFlag } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { ChangePhotoSheet } from "@/components/members/photo/change-photo-sheet";
import { YouView } from "@/components/members/you/you-view";
import { updateAvatar } from "../../profile/actions";
import { loadYou } from "../load-you";

// Change photo: You, with the Change photo sheet open over it (a centred modal
// on a computer). A page of its own so the address works and the back button
// closes the sheet. Switched off with the photo gate: off, this is a 404.
export default async function MembersChangePhotoPage() {
  requireFlag("photoGate");
  const [props, mode] = await Promise.all([loadYou(), detectShellMode()]);

  return <YouView {...props} sheet={<ChangePhotoSheet key="change-photo" mode={mode} upload={updateAvatar} firstName={props.firstName} />} />;
}
