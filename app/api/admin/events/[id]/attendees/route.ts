import { requireAdmin } from "@/app/admin/require-admin";
import { audit } from "@/lib/server/audit";
import { attendeesCsv, attendeesCsvFilename, listAttendees } from "@/lib/server/events";

export const dynamic = "force-dynamic";

// GET /api/admin/events/<id>/attendees: the Attendees list as a .csv download
// (r2b Events, Export list, B-D7). Admins at aal2 only (requireAdmin).
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const list = await listAttendees(id);
  if (!list.event) return new Response("Not found", { status: 404 });
  await audit(admin.id, "event.export_attendees", { type: "event", id }, { rows: list.attendees.length });
  return new Response(attendeesCsv(list), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${attendeesCsvFilename(list.event)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
