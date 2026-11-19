import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/server/db";
import { MAX_BYTES, check, keyFor, plan, report, tooMany } from "@/lib/server/outreach/drafter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Outlook drafter on Albert's Mac talks to the desk here (Outreach Desk, Phase 2, 16 Nov 2026), with its own key in
// "Authorization: Bearer <key>". The desk keeps only the key's fingerprint (Desk > Settings); unlinking stops it at once.
//   GET  hello    the key works; the server's time
//   GET  plan     what to look for in Outlook, and which follow-up drafts to make
//   POST check    {addresses}: opted out, already contacted, or fine
//   POST report   {runId?, startedAt, mailbox, items[], final?, ok?, counts?, message?}: what the drafter found
// Nothing here sends email, deletes desk records, changes an opt-out or reads anything outside the desk.

function no(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function guard(request: Request) {
  if (tooMany()) return { refusal: no(429, "Too many requests. Wait a minute.") };
  const db = serviceDb();
  const key = await keyFor(db, request.headers.get("authorization"));
  if (!key) return { refusal: no(401, "This drafter isn't linked to the desk. Run: draft-partner-emails desk-link") };
  return { db, key };
}

export async function GET(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "hello" && action !== "plan") return no(404, "No such action.");
  const g = await guard(request);
  if ("refusal" in g) return g.refusal;
  if (action === "hello") return NextResponse.json({ ok: true, now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(await plan(g.db, new Date(), g.key.owner), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "check" && action !== "report") return no(404, "No such action.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return no(413, "Too big. Send fewer items at a time.");
  const g = await guard(request);
  if ("refusal" in g) return g.refusal;
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return no(413, "Too big. Send fewer items at a time.");
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    payload = parsed;
  } catch {
    return no(400, "That isn't JSON.");
  }
  if (action === "check") return NextResponse.json({ results: await check(g.db, payload.addresses) }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(await report(g.db, g.key.id, payload, g.key.owner), { headers: { "Cache-Control": "no-store" } });
}
