import { requireMember } from "../../../require-member";
import { flags } from "@/lib/members/flags";
import { helpFaqGroups } from "@/lib/members/you/help";
import { FaqView } from "@/components/members/you/faq-view";

export default async function MembersHelpFaqPage() {
  await requireMember();
  return <FaqView groups={helpFaqGroups(flags)} />;
}
