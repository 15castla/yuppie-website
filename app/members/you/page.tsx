import { YouView } from "@/components/members/you/you-view";
import { loadYou } from "./load-you";

// You: your photo, the greeting, the membership, your details, Settings, Help
// and the account actions. Opened from the member's photo, top right of every
// main page. /members/profile redirects here. The view is pure (components/
// members/you/you-view.tsx); this file only fetches. ?billing=unavailable is
// where /members/billing sends the member back when the portal did not open.
export default async function MembersYouPage({ searchParams }: { searchParams: Promise<{ billing?: string | string[] }> }) {
  const { billing } = await searchParams;
  return <YouView {...(await loadYou({ billingUnavailable: billing === "unavailable" }))} />;
}
