// The in-app FAQs: the public site's approved answers (components/site/
// faq-data.ts, shared so the two cannot drift), the ones a member needs, in
// the design's two groups, plus two new answers that only make sense once the
// thing they describe is switched on (the photo gate and Open Invite). The
// public FAQ's "Joining" questions (approval, being charged when you apply)
// are left out: a member is already in.
//
// NEW COPY (needs Albert's eye): the two answers below and the group names.

import { FAQ_ITEMS, type FaqEntry } from "@/components/site/faq-data";
import type { Flags } from "@/lib/members/flags";

export type HelpFaqGroup = { label: string; items: FaqEntry[] };

const PHOTO_FAQ: FaqEntry = {
  id: "photo",
  question: "Who can see my photo?",
  answer: "Only members who are logged in. Your photo is never on the public site.",
};

const OPEN_INVITE_FAQ: FaqEntry = {
  id: "open-invite",
  question: "What is Open Invite?",
  answer: "Post a plan you’d like company for, or say you’re in on someone else’s. It’s part of your membership.",
};

function publicEntry(id: string): FaqEntry {
  const entry = FAQ_ITEMS.find((item) => item.id === id);
  if (!entry) throw new Error(`Public FAQ entry "${id}" is missing`);
  return entry;
}

export function helpFaqGroups(on: Pick<Flags, "photoGate" | "openInvite">): HelpFaqGroup[] {
  const membership: FaqEntry[] = [publicEntry("membership")];
  if (on.photoGate) membership.push(PHOTO_FAQ);

  const onceIn: FaqEntry[] = [publicEntry("book"), publicEntry("pay-events")];
  if (on.openInvite) onceIn.push(OPEN_INVITE_FAQ);
  onceIn.push(publicEntry("perks"));

  return [
    { label: "Your membership", items: membership },
    { label: "Once you’re in", items: onceIn },
  ];
}
