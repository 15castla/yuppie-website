import { NextResponse } from "next/server";

import * as adminApplications from "@/app/admin/applications-actions";
import * as adminEvents from "@/app/admin/events-actions";
import * as adminEventBookings from "@/app/admin/event-booking-actions";
import * as adminMembers from "@/app/admin/members-actions";
import * as adminMemberStatus from "@/app/admin/member-status-actions";
import * as apply from "@/app/apply/actions";
import * as events from "@/app/members/events/actions";
import * as profile from "@/app/members/profile/actions";
import * as you from "@/app/members/you/actions";

export const dynamic = "force-dynamic";

// TEST ONLY. Lets the Phase A test scripts (tests/e2e/phase-a/) call the real
// server actions as the signed-in caller, before the screens that will call
// them exist. Off unless MEMBERS_TEST_HOOKS=on, and always off on the live
// site (VERCEL_ENV=production): it answers 404 then, exactly as if it did not
// exist. It grants nothing a caller cannot already do: every server action is
// a public endpoint that checks the session itself (requireMember,
// requireAdmin), and these are called with the caller's own cookies.
//
// POST /api/test-hooks/<module>.<export> with {"args": [...]}; an argument
// {"$formData": {"k": "v"}} becomes a FormData. Answers {result}, or
// {redirect} / {notFound} when the action redirects or 404s.

const MODULES: Record<string, Record<string, unknown>> = {
  "admin.applications": adminApplications,
  "admin.events": adminEvents,
  "admin.eventBookings": adminEventBookings,
  "admin.members": adminMembers,
  "admin.memberStatus": adminMemberStatus,
  apply,
  events,
  profile,
  you,
};

function enabled(): boolean {
  return process.env.MEMBERS_TEST_HOOKS === "on" && process.env.VERCEL_ENV !== "production";
}

function decodeArg(arg: unknown): unknown {
  if (arg && typeof arg === "object" && "$formData" in arg) {
    const fd = new FormData();
    for (const [k, v] of Object.entries((arg as { $formData: Record<string, string | string[]> }).$formData)) {
      for (const value of Array.isArray(v) ? v : [v]) fd.append(k, value);
    }
    return fd;
  }
  return arg;
}

function digestOf(err: unknown): string | null {
  return err && typeof err === "object" && "digest" in err && typeof err.digest === "string" ? err.digest : null;
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }) {
  if (!enabled()) return new NextResponse("Not found", { status: 404 });
  const { action } = await ctx.params;
  const dot = action.lastIndexOf(".");
  const mod = MODULES[action.slice(0, dot)];
  const name = action.slice(dot + 1);
  const fn = mod && Object.hasOwn(mod, name) ? mod[name] : undefined;
  if (typeof fn !== "function") return NextResponse.json({ error: `no action ${action}` }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { args?: unknown[] };
  const args = (body.args ?? []).map(decodeArg);
  try {
    const result = await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
    return NextResponse.json({ result: result ?? null });
  } catch (err) {
    const digest = digestOf(err);
    if (digest?.startsWith("NEXT_REDIRECT")) {
      const [, , url] = digest.split(";");
      return NextResponse.json({ redirect: url });
    }
    if (digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return NextResponse.json({ notFound: true });
    console.error(`test-hooks ${action} threw:`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
