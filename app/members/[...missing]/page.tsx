import { notFound } from "next/navigation";

import { requireMember } from "../require-member";

// Any members address with no page of its own: the members 404 ("Not on the list.") inside the members
// shell, rather than the public one. Pages with their own segment always win over this one. A paused or
// ended member still meets the gate first (A-D4: nothing else opens).
export default async function MembersMissingPage() {
  await requireMember();
  notFound();
}
