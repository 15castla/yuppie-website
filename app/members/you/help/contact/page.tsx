import { requireMember } from "../../../require-member";
import { ContactView } from "@/components/members/you/help-views";

export default async function MembersHelpContactPage() {
  await requireMember();
  return <ContactView />;
}
