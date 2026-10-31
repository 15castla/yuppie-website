import { redirect } from "next/navigation";

import { flags } from "@/lib/members/flags";
import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";

// There is no Home page. /members goes to the landing page: Open Invite when
// its flag is on, else Events. next.config.ts redirects /members before it
// renders (no flash of the shell); this is the same redirect for any request
// that reaches the page anyway.
export default async function MembersIndexPage() {
  redirect(landingPath(flags, await detectShellMode()));
}
