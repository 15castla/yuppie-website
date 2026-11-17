import { NextResponse } from "next/server";

import { originOf, resourceMetadata } from "@/lib/server/outreach/connector";

export const dynamic = "force-dynamic";

// What the Desk connector is and who signs in for it (RFC 9728; Outreach Desk, Phase 3).
export function GET(request: Request) {
  return NextResponse.json(resourceMetadata(originOf(request)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
