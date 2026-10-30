import { TopActions } from "@/components/members/shell/top-actions";
import { MembersNotFoundView } from "@/components/members/system/not-found-view";
import { OwnDockTabs } from "@/components/members/system/own-dock-tabs";
import { landingLabel, landingPath } from "@/lib/members/routes";

// "Not on the list." inside the members shell (r2b section 3, B-D10 A): any notFound() in a members page
// (an event, a plan or a chat that does not exist) and any members address with no page
// (app/members/[...missing]). The tab bar and the top bar stay; no tab is lit.
export default function MembersNotFound() {
  return (
    <>
      <MembersNotFoundView landingHref={landingPath()} landingLabel={landingLabel()} titleActions={<TopActions />} />
      <OwnDockTabs />
    </>
  );
}
