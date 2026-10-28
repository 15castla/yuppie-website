import { redirect } from "next/navigation";

import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { legalLines } from "@/lib/members/you/format";
import { isGated } from "@/lib/server/membership";
import { BareChrome } from "@/components/members/shell/bare-chrome";
import { Wordmark } from "@/components/members/shell/wordmark";
import { Button, Main } from "@/components/members/kit";
import { MembershipEndedView } from "@/components/members/you/ended-view";
import { CONTACT_EMAIL } from "@/components/site/links";
import { signOutMember } from "../profile/actions";
import { getMembershipState, requireMember } from "../require-member";

// The membership gate (decision A-D4). requireMember() sends every paused or
// ended member here from every other members page; this page is the one that
// lets them in (allowGated). Ended: the approved round 3 gate
// (components/members/you/ended-view.tsx). Paused: a plain placeholder until
// the member flows screens draw the real paused gate (r2a section 8). An
// active member who opens this address goes to the landing page.
export default async function MembershipGatePage() {
  await requireMember({ allowGated: true, allowMissingPhoto: true });
  const state = await getMembershipState();
  if (!state || !isGated(state.state)) redirect(landingPath());

  const mode = await detectShellMode();

  if (state.state === "cancelled") {
    return (
      <MembershipEndedView
        mode={mode}
        endedOn={state.endsOn ?? null}
        legal={legalLines(new Date().getFullYear())}
        signOut={signOutMember}
      />
    );
  }

  // PLACEHOLDER (paused): the words are r2a's; the layout is the member flows agent's to draw.
  return (
    <Main className="yu-main">
      <BareChrome />
      <div className="mk-wrap" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <Wordmark />
        <h1 className="mk-h1" style={{ marginTop: 32 }}>
          Your membership is paused.
        </h1>
        <p className="mk-lead">Events, Discounts and Access are switched off until it’s back on.</p>
        <p className="mk-lead">Your details, photo and bookings are kept while it’s paused.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 24 }}>
          <Button href={`mailto:${CONTACT_EMAIL}`}>Get in touch</Button>
          <form action={signOutMember}>
            <Button variant="quiet" type="submit">
              Log out
            </Button>
          </form>
        </div>
      </div>
    </Main>
  );
}
