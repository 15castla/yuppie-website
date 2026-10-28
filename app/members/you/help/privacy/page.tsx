import { requireMember } from "../../../require-member";
import { POLICY_SECTIONS, policyIntro, policyLastUpdated } from "@/components/site/privacy-data";
import { PrivacyView } from "@/components/members/you/help-views";

// The public privacy policy's own text, read in the app.
export default async function MembersHelpPrivacyPage() {
  // Help stays open to paused and ended members (A-D4).
  await requireMember({ allowGated: true });
  return <PrivacyView intro={policyIntro()} lastUpdated={policyLastUpdated()} sections={POLICY_SECTIONS} />;
}
