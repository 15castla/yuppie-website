import { NextResponse } from "next/server";

import { runMemberships } from "@/lib/server/cron/memberships";
import { runRefunds } from "@/lib/server/cron/refunds";
import { runReminders } from "@/lib/server/cron/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled jobs: GET /api/cron/reminders, /api/cron/memberships and /api/cron/refunds, with
// "Authorization: Bearer ${CRON_SECRET}" (Vercel Cron sends exactly that;
// pg_cron sends it too: release/schedule-cron.sql). Each job is idempotent and
// safe every 15 minutes; the answer is a JSON summary of what it did. The
// schedule itself is the release's to set (no vercel.json crons here).

const JOBS = {
  reminders: runReminders,
  memberships: runMemberships,
  refunds: runRefunds,
} as const;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i += 1) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function GET(request: Request, ctx: { params: Promise<{ job: string }> }) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }
  const { job } = await ctx.params;
  const run = Object.hasOwn(JOBS, job) ? JOBS[job as keyof typeof JOBS] : null;
  if (!run) return NextResponse.json({ error: "No such job." }, { status: 404 });

  const startedAt = new Date();
  try {
    const result = await run(startedAt);
    return NextResponse.json({ job, ok: true, startedAt: startedAt.toISOString(), ms: Date.now() - startedAt.getTime(), result });
  } catch (err) {
    console.error(`cron ${job} failed:`, err);
    return NextResponse.json({ job, ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
