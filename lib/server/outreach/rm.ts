// Relationship Managers on the desk (19 Nov 2026): each partner's RM is someone on the desk team, shown as their
// initials (AC, KW). Pure helpers, no database: the pages filter by RM with ?rm=AC, ?rm=KW or ?rm=all.

import type { DeskData } from "./compute";

export type TeamMember = { id: string; initials: string; name: string; firstName: string; owner: boolean };

/** The team member who is a partner's RM, if any. */
export function rmFor(team: TeamMember[], rm: string | null | undefined): TeamMember | null {
  return rm ? (team.find((m) => m.id === rm) ?? null) : null;
}

export type RmChoice = { key: string; id: string | null };

/**
 * The RM filter from ?rm=: "all" (everyone), or someone's initials. Without it, `fallback`: "all" on the Blotter and
 * Partners, the person looking on Today.
 */
export function rmChoice(param: string | undefined, team: TeamMember[], me: TeamMember, fallback: "all" | "me"): RmChoice {
  const p = (param ?? "").trim().toUpperCase();
  if (p === "ALL") return { key: "all", id: null };
  const m = team.find((x) => x.initials === p);
  if (m) return { key: m.initials, id: m.id };
  return fallback === "me" && team.some((x) => x.id === me.id) ? { key: me.initials, id: me.id } : { key: "all", id: null };
}

/** The desk's rows for one RM's partners (all of them when id is null). A partner with no RM counts as the owner's. */
export function forRm(data: DeskData, id: string | null, ownerId?: string | null): DeskData {
  if (!id) return data;
  const mine = (rm: string | null | undefined) => (rm ?? ownerId ?? null) === id;
  const targets = data.targets.filter((t) => mine(t.rm));
  const ids = new Set(targets.map((t) => t.id));
  const keep = <T extends { target_id: string }>(list: T[]) => list.filter((x) => ids.has(x.target_id));
  return {
    targets,
    contacts: keep(data.contacts),
    touches: keep(data.touches),
    outcomes: keep(data.outcomes),
    followups: keep(data.followups),
    actions: keep(data.actions),
    stageHistory: keep(data.stageHistory),
    texts: data.texts ? keep(data.texts) : undefined,
  };
}
