import { requireMember } from "../../../require-member";
import { flags } from "@/lib/members/flags";
import { helpFaqGroups } from "@/lib/members/you/help";
import { FaqView } from "@/components/members/you/faq-view";

export default async function MembersHelpFaqPage() {
  // Help stays open to paused and ended members (A-D4).
  await requireMember({ allowGated: true });
  return <FaqView groups={helpFaqGroups(flags)} />;
}
