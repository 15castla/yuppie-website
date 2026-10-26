"use client";

import type { Member } from "@/app/members/require-member";
import {
  removeAvatar,
  requestEmailChange,
  updateAvatar,
  updateProfile,
  verifyEmailChange,
} from "@/app/members/profile/actions";
import { EditDetailsView } from "./you/edit-details";

// Edit details (/members/profile/edit, kept at that path). The view is in
// ./you/edit-details.tsx; this file only hands it the real server actions.
// The page passes showPhotoUpload (today's upload and remove row): true while
// the photo gate flag is off; with it on, a photo changes from You.
export function ProfileEditView({ member, showPhotoUpload }: { member: Member; showPhotoUpload: boolean }) {
  return (
    <EditDetailsView
      member={member}
      actions={{ updateProfile, updateAvatar, removeAvatar, requestEmailChange, verifyEmailChange }}
      showPhotoUpload={showPhotoUpload}
    />
  );
}
