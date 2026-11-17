import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/server/db";
import { OAuthError, checkAuthorize, exchange, originOf, registerClient, tooMany } from "@/lib/server/outreach/connector";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Desk connector's sign-in (Phase 3; lib/server/outreach/connector.ts):
//   POST /api/desk/oauth/register    Claude registers itself (callbacks on claude.ai or claude.com only)
//   GET  /api/desk/oauth/authorize   checks the request, then Albert's consent page (signing in first if needed)
//   POST /api/desk/oauth/token       a one-off code (with PKCE) or a refresh token, for tokens

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function oauthError(err: unknown) {
  if (err instanceof OAuthError) return NextResponse.json({ error: err.code, error_description: err.description }, { status: err.status, headers: NO_STORE });
  console.error("desk oauth failed:", err);
  return NextResponse.json({ error: "server_error", error_description: "Something went wrong. Try again." }, { status: 500, headers: NO_STORE });
}

/** Signed in to /admin with password and authenticator code? (The consent page checks the owner itself.) */
async function signedInAal2(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return aal?.currentLevel === "aal2";
}

export async function GET(request: Request, ctx: { params: Promise<{ step: string }> }) {
  const { step } = await ctx.params;
  if (step !== "authorize") return new NextResponse("Not found", { status: 404 });
  if (tooMany("authorize", 30)) return new NextResponse("Too many requests. Wait a minute.", { status: 429, headers: NO_STORE });
  const url = new URL(request.url);
  try {
    await checkAuthorize(serviceDb(), url.searchParams);
  } catch (err) {
    const message = err instanceof OAuthError ? err.description : "Something went wrong.";
    return new NextResponse(`Couldn't connect the desk: ${message}`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });
  }
  const origin = originOf(request);
  const consent = `/admin/desk/connect?${url.searchParams.toString()}`;
  if (!(await signedInAal2())) return NextResponse.redirect(`${origin}/admin/login?next=${encodeURIComponent(consent)}`, { status: 303 });
  return NextResponse.redirect(`${origin}${consent}`, { status: 303 });
}

export async function POST(request: Request, ctx: { params: Promise<{ step: string }> }) {
  const { step } = await ctx.params;
  if ((step === "register" || step === "token") && tooMany(step, step === "register" ? 10 : 60)) {
    return NextResponse.json({ error: "slow_down", error_description: "Too many requests. Wait a minute." }, { status: 429, headers: NO_STORE });
  }
  const db = serviceDb();
  try {
    if (step === "register") {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) throw new OAuthError("invalid_client_metadata", "That isn't JSON.");
      return NextResponse.json(await registerClient(db, body), { status: 201, headers: NO_STORE });
    }
    if (step === "token") {
      const type = request.headers.get("content-type") ?? "";
      const form = type.includes("application/json")
        ? new URLSearchParams(Object.entries((await request.json().catch(() => ({}))) as Record<string, string>))
        : new URLSearchParams(await request.text());
      return NextResponse.json(await exchange(db, form), { headers: NO_STORE });
    }
  } catch (err) {
    return oauthError(err);
  }
  return new NextResponse("Not found", { status: 404 });
}
