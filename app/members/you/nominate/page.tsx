import { NominateView } from "@/components/members/nominate/nominate-view";
import { requireFlag } from "@/lib/members/flags";
import { nominatePage } from "@/lib/server/nominations";
import { requireMember } from "../../require-member";

// Nominate a friend (12 Nov 2026): the member's link and code (made the first time they come here), their
// nominations and their credit (lib/server/nominations.ts, lib/server/credit.ts). Behind the nominations flag.
export default async function NominatePage() {
  requireFlag("nominations");
  const member = await requireMember();
  const data = await nominatePage(member);
  return <NominateView data={data} />;
}
