import { NextResponse } from "next/server";

import { originOf, resourceMetadata } from "@/lib/server/outreach/connector";

export const dynamic = "force-dynamic";

// The same, at the address with the resource's path in it (RFC 9728 section 3.1), which some clients ask for first.
export function GET(request: Request) {
  return NextResponse.json(resourceMetadata(originOf(request)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
}
