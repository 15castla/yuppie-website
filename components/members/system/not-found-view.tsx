// "Not on the list." (r2b section 3, decision B-D10 A). Members: inside the members shell, the tab bar and
// the top bar stay (no tab is lit) and the pill goes back to the landing page. Public: under the public
// header, "Back to home" and "Contact us". The rope stands on the floor.

import { Button } from "@/components/members/kit";
import { CONTACT_EMAIL } from "@/components/site/links";
import type { ReactNode } from "react";
import { SystemHelp, SystemScreen } from "./system-screen";

const TITLE = "Not on the";
const ACCENT = "list.";
const LEAD = "We can’t find that page. It may have moved.";
const HELP = <SystemHelp lead="Think it should be here? Email" email={CONTACT_EMAIL} />;

export function MembersNotFoundView({
  landingHref,
  landingLabel,
  titleActions,
}: {
  landingHref: string;
  /** "Events" (or "Open Invite" when it is on). */
  landingLabel: string;
  /** The member's photo in the app's title row (the shell's TopActions). */
  titleActions: ReactNode;
}) {
  return (
    <SystemScreen
      title={TITLE}
      accent={ACCENT}
      lead={LEAD}
      floor="dock"
      art="rope"
      titleActions={titleActions}
      actions={
        <Button blockPhone href={landingHref}>
          Back to {landingLabel}
        </Button>
      }
      help={HELP}
    />
  );
}

export function PublicNotFoundView() {
  return (
    <SystemScreen
      title={TITLE}
      accent={ACCENT}
      lead={LEAD}
      floor="own"
      art="rope"
      actions={
        <>
          <Button blockPhone href="/">
            Back to home
          </Button>
          <Button variant="quiet" href="/contact">
            Contact us
          </Button>
        </>
      }
      help={HELP}
    />
  );
}
