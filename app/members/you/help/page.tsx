import { requireMember } from "../../require-member";
import { HelpIndexView } from "@/components/members/you/help-views";

// In-app Help: FAQs, Contact us and the Privacy policy. The native app
// redirects the public /faq, /contact and /privacy out of the app, so these
// pages are the app's own.
export default async function MembersHelpPage() {
  await requireMember();
  return <HelpIndexView />;
}
