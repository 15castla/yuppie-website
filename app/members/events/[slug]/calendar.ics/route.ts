import { notFound } from "next/navigation";

import { calendarForMember } from "@/lib/server/events";
import { requireMember } from "@/app/members/require-member";

export const dynamic = "force-dynamic";

// GET /members/events/<slug>/calendar.ics: Add to calendar (r2a section 4;
// the booking email links here). Only for a member with a confirmed booking:
// the file carries the exact address (A-D3). Anyone else gets a 404.
export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const member = await requireMember();
  const { slug } = await ctx.params;
  const data = await calendarForMember(member.id, { slug });
  if (!data) notFound();
  return new Response(data.ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
