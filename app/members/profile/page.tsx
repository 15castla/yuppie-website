import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/members/routes";

// The old profile page now lives at /members/you. Saved links and the old
// tab keep working. (/members/profile/edit is unchanged.)
export default function MembersProfileRedirectPage() {
  redirect(ROUTES.you);
}
