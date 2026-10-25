import { redirect } from "next/navigation";

import { landingPath } from "@/lib/members/routes";

// There is no Home page. /members goes to the landing page: Open Invite when
// its flag is on, else Events. next.config.ts redirects /members before it
// renders (no flash of the shell); this is the same redirect for any request
// that reaches the page anyway.
export default function MembersIndexPage() {
  redirect(landingPath());
}
