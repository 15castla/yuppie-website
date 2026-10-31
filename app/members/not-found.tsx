import { TopActions } from "@/components/members/shell/top-actions";
import { MembersNotFoundView } from "@/components/members/system/not-found-view";
import { OwnDockTabs } from "@/components/members/system/own-dock-tabs";
import { landingLabel, landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";

// "Not on the list." inside the members shell (r2b section 3, B-D10 A): any notFound() in a members page
// (an event, a plan or a chat that does not exist) and any members address with no page
// (app/members/[...missing]). The tab bar and the top bar stay; no tab is lit.
// The landing page is this shell's: in the app Open Invite also needs its own switch (Open Invite decision 6).
export default async function MembersNotFound() {
  const mode = await detectShellMode();
  return (
    <>
      <MembersNotFoundView landingHref={landingPath(undefined, mode)} landingLabel={landingLabel(undefined, mode)} titleActions={<TopActions />} />
      <OwnDockTabs />
    </>
  );
}
