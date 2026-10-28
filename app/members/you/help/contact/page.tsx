import { requireMember } from "../../../require-member";
import { ContactView } from "@/components/members/you/help-views";

export default async function MembersHelpContactPage() {
  // Help stays open to paused and ended members (A-D4).
  await requireMember({ allowGated: true });
  return <ContactView />;
}
