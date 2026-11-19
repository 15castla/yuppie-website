import "server-only";

// The desk team (19 Nov 2026): the owner (Albert, AC) and every admin with desk access (Kira, KW), each with the code
// shown as a partner's Relationship Manager. Set by the migration (the owner) and release/add-desk-admin.sql (anyone
// else), never by the app.

import { serviceDb, type ServiceDb } from "@/lib/server/db";
import { rmFor, type TeamMember } from "./rm";

export type { TeamMember } from "./rm";

/** Everyone on the desk, the owner first. Before the 20 Nov migration: just the owner, as AC. */
export async function loadTeam(db: ServiceDb = serviceDb()): Promise<TeamMember[]> {
  const { data, error } = await db.from("admin_users").select("id, is_owner, desk_access, initials, full_name").or("is_owner.eq.true,desk_access.eq.true");
  if (error) {
    const { data: owner } = await db.from("admin_users").select("id").eq("is_owner", true).maybeSingle();
    return owner ? [{ id: owner.id as string, initials: "AC", name: "Albert Castle", firstName: "Albert", owner: true }] : [];
  }
  return (data ?? [])
    .map((r) => {
      const name = (r.full_name as string | null)?.trim() || (r.is_owner ? "Albert Castle" : "Admin");
      return {
        id: r.id as string,
        initials:
          (r.initials as string | null) ||
          (r.is_owner
            ? "AC"
            : name
                .split(/\s+/)
                .map((w) => w[0] ?? "")
                .join("")
                .slice(0, 3)
                .toUpperCase() || "??"),
        name,
        firstName: name.split(/\s+/)[0],
        owner: r.is_owner === true,
      };
    })
    .sort((a, b) => Number(b.owner) - Number(a.owner) || a.initials.localeCompare(b.initials));
}

/** The team, and who is looking. */
export async function loadMe(userId: string, db: ServiceDb = serviceDb()): Promise<{ team: TeamMember[]; me: TeamMember }> {
  const team = await loadTeam(db);
  const me = team.find((m) => m.id === userId) ?? { id: userId, initials: "??", name: "You", firstName: "You", owner: false };
  return { team, me };
}

export { rmFor };
