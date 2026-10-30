import { redirect } from "next/navigation";

import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { legalLines } from "@/lib/members/you/format";
import { isGated } from "@/lib/server/membership";
import { MembershipEndedView } from "@/components/members/you/ended-view";
import { MembershipPausedView } from "@/components/members/gates/paused-view";
import { GateDeleteAccount } from "@/components/members/gates/gate-delete";
import { signOutMember } from "../profile/actions";
import { getMembershipState, requireMember } from "../require-member";

// The membership gate (decision A-D4). requireMember() sends every paused or
// ended member here from every other members page; this page is the one that
// lets them in (allowGated). Ended: the approved round 3 gate
// (components/members/you/ended-view.tsx). Paused: the r2a paused gate
// (components/members/gates/paused-view.tsx). Decided on the server, on every
// request. An active member who opens this address goes to the landing page.
export default async function MembershipGatePage() {
  await requireMember({ allowGated: true, allowMissingPhoto: true });
  const state = await getMembershipState();
  if (!state || !isGated(state.state)) redirect(landingPath());

  const mode = await detectShellMode();
  const legal = legalLines(new Date().getFullYear());

  if (state.state === "cancelled") {
    return <MembershipEndedView mode={mode} endedOn={state.endsOn ?? null} legal={legal} signOut={signOutMember} />;
  }

  return <MembershipPausedView mode={mode} legal={legal} signOut={signOutMember} deleteAccount={<GateDeleteAccount />} />;
}
