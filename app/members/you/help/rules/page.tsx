import { requireMember } from "../../../require-member";
import { RulesHelpView } from "@/components/members/rules/rules-view";

// The community rules, to read again (the rules gate's own text: components/site/rules-data.ts).
export default async function MembersHelpRulesPage() {
  // Help stays open to paused and ended members (A-D4), and to members who have not agreed yet.
  await requireMember({ allowGated: true });
  return <RulesHelpView />;
}
