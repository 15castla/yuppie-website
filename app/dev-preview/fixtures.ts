// EXAMPLE CONTENT for the preview harness only: the people the approved
// mockups use (Sam, Jasmin, Priya, Tom, Marcus, Aisha, Dan, Chloe, Ollie),
// with the club's own drawings standing in for photos. ?member=<key> picks
// who is signed in.

import { examplePhoto } from "@/lib/members/mock/example-photos";
import type { MemberSummary } from "@/components/members/shell/types";

const person = (firstName: string, letter: Parameters<typeof examplePhoto>[0]): MemberSummary => ({
  firstName,
  photoUrl: examplePhoto(letter),
});

const PEOPLE: Record<string, MemberSummary> = {
  sam: person("Sam", "S"),
  jasmin: person("Jasmin", "J"),
  priya: person("Priya", "P"),
  tom: person("Tom", "T"),
  marcus: person("Marcus", "M"),
  aisha: person("Aisha", "A"),
  dan: person("Dan", "D"),
  chloe: person("Chloe", "C"),
  ollie: person("Ollie", "O"),
  // A member with no photo yet (the photo gate is off at launch): the shell draws the initial.
  nophoto: { firstName: "Sam", photoUrl: null },
  // A long first name, for the computer header.
  longname: { firstName: "Bartholomew-Alexander", photoUrl: examplePhoto("S") },
};

export const MEMBER_KEYS = [...Object.keys(PEOPLE), "loading", "none"] as const;

export function memberFixture(key: string): MemberSummary | null | Promise<null> {
  if (key === "none") return null;
  // Never resolves: the photo slot stays the empty fixed ring, to show it does not shift.
  if (key === "loading") return new Promise<null>(() => {});
  return PEOPLE[key] ?? PEOPLE.sam;
}
