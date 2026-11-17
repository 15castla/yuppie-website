import { NextResponse } from "next/server";

import { authServerMetadata, originOf } from "@/lib/server/outreach/connector";

export const dynamic = "force-dynamic";

// Where Claude finds the Desk connector's sign-in (RFC 8414; Outreach Desk, Phase 3).
export function GET(request: Request) {
  return NextResponse.json(authServerMetadata(originOf(request)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
