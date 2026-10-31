import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { flags, messagesOn, openInviteOn } from "@/lib/members/flags";
import { isNativeAppCookie, isNativeAppUserAgent } from "@/lib/native-app";
import { MEMBERS_PATH_HEADER } from "@/lib/members/photo/return-path";
import { ROUTES, matchRoute } from "@/lib/members/routes";
import { testHooksEnabled } from "@/lib/test-hooks";

// What kind of request this is, for the two decisions below. A server action is a POST to the page's own
// address carrying the Next-Action header; a router refresh, a soft navigation and a prefetch are GETs with
// the RSC header; a page load (typing the address, a reload, a link from an email) is a plain GET.
function isNavigation(request: NextRequest): boolean {
  return (request.method === "GET" || request.method === "HEAD") && !request.headers.has("next-action");
}

function isPageLoad(request: NextRequest): boolean {
  if (!isNavigation(request)) return false;
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return false;
  const dest = request.headers.get("sec-fetch-dest");
  return !dest || dest === "document";
}

// Members addresses that are not in lib/members/routes.ts ROUTE_TABLE but answer: the landing redirect, the
// billing portal route, the legacy profile redirect, an event's calendar file, and the test-only error page.
const EXTRA_MEMBERS_PATHS = new Set<string>([ROUTES.root, ROUTES.billing, ROUTES.profile]);
const CALENDAR_FILE = /^\/members\/events\/[^/]+\/calendar\.ics$/;
const TEST_ERROR_PATH = "/members/test-error";

/**
 * A members page load that will only ever draw "Not on the list.": an address with no page, a page behind a
 * feature flag that is off, or an event whose slug does not exist. Decided here, before the page renders,
 * because the members layout streams its shell straight away, and once the first byte has gone the status is
 * 200 whatever the page does (Next's HTTP contract; node_modules/next/dist/docs/01-app/02-guides/streaming.md).
 * Fails open: if the events lookup errors, the page decides as before.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stage 2: may this member open this plan (plan_visible_to_me: host, going, or not removed, not priced, no block
// either way)? With the member's own token; the function answers about the caller only. Fails open.
async function planHidden(planId: string, supabase: SupabaseClient): Promise<boolean> {
  if (!UUID.test(planId)) return true;
  const { data, error } = await supabase.rpc("plan_visible_to_me", { p_plan: planId });
  if (error) {
    console.error(`proxy: plan lookup for ${planId} failed:`, error);
    return false;
  }
  return data !== true;
}

async function isMissingMembersPage(pathname: string, supabase: SupabaseClient, request: NextRequest): Promise<boolean> {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (EXTRA_MEMBERS_PATHS.has(path) || CALENDAR_FILE.test(path)) return false;
  if (path === TEST_ERROR_PATH) return !testHooksEnabled();
  const route = matchRoute(path);
  if (!route) return true;
  if (route.flag && !flags[route.flag]) return true;
  const app = isNativeAppUserAgent(request.headers.get("user-agent") ?? "") || isNativeAppCookie(request.headers.get("cookie") ?? "");
  // Open Invite in the app needs its own switch too (Open Invite decision 6).
  if (route.flag === "openInvite" || route.id.startsWith("openInvite")) {
    if (!openInviteOn(app ? "app" : "web")) return true;
  }
  // So does Messages: every chat belongs to an Open Invite, so the app hides it while it hides Open Invite, and
  // You > Blocked members with it (blocks are made in chats; QR-04).
  if ((route.id === "messages" || route.id === "messageThread" || route.id === "youBlocked") && !messagesOn(app ? "app" : "web")) return true;
  if (route.id === "openInviteDetail" || route.id === "openInviteEdit") {
    let id: string;
    try {
      id = decodeURIComponent(path.split("/")[3] ?? "");
    } catch {
      return true;
    }
    return planHidden(id, supabase);
  }
  if (route.id === "messageThread") {
    let chatId: string;
    try {
      chatId = decodeURIComponent(path.split("/")[3] ?? "");
    } catch {
      return true;
    }
    // A question not asked yet ("ask-<plan id>"): the plan must be one they may see.
    if (chatId.startsWith("ask-")) return planHidden(chatId.slice(4), supabase);
    if (!UUID.test(chatId)) return true;
    // Their own row in the chat (RLS: their rows only): in it, or left it by choice (opening it puts them back).
    const { data, error } = await supabase.from("chat_members").select("left_at, left_reason").eq("chat_id", chatId).maybeSingle();
    if (error) {
      console.error(`proxy: chat lookup for ${chatId} failed:`, error);
      return false;
    }
    return !data || (data.left_at !== null && data.left_reason !== "left_chat");
  }
  if (route.id === "eventDetail") {
    let slug: string;
    try {
      slug = decodeURIComponent(path.split("/")[3] ?? "");
    } catch {
      return true;
    }
    const { data, error } = await supabase.from("events").select("id").eq("slug", slug).limit(1).maybeSingle();
    if (error) {
      console.error(`proxy: event lookup for ${slug} failed:`, error);
      return false;
    }
    return !data;
  }
  return false;
}

// The members address a request is for (path and query), passed on to the page as a request header
// (lib/members/photo/return-path.ts): the photo gate sends a member with no photo back there after Continue. Set
// here for every request, so a value sent by the browser is always replaced.
export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(MEMBERS_PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // The refreshed cookies go on to the page too (request.cookies above), with the path header.
          const refreshed = new Headers(request.headers);
          refreshed.set(MEMBERS_PATH_HEADER, requestHeaders.get(MEMBERS_PATH_HEADER) ?? "");
          supabaseResponse = NextResponse.next({ request: { headers: refreshed } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if expired (getClaims goes through getSession,
  // which refreshes a near-expiry token and writes the new cookies via
  // setAll above). Required for Server Components, which cannot write
  // cookies themselves. getClaims rather than getUser: with asymmetric JWT
  // signing keys it verifies the token locally against the cached JWKS
  // instead of calling Supabase Auth on every request. With the legacy
  // shared secret it falls back to a getUser-style network call.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isMembersPath = pathname === "/members" || pathname.startsWith("/members/");

  // Signed out on a members page: a real 307 to /member-login now, rather
  // than rendering the members layout, streaming its loading screen and
  // only redirecting once the page's JavaScript runs (AuthGate's
  // redirect() sits inside a Suspense boundary). The app opens on
  // /members, so this is every signed-out launch. Only when there's no
  // valid session at all: a session without a members row still goes
  // through requireMember() as before. Any cookies getClaims just set
  // (a refreshed or cleared session) are copied onto the redirect, as
  // Supabase's middleware guide says to when returning a different
  // response object.
  //
  // Navigations only (page loads, soft navigations, prefetches). A server
  // action (Book, Pay, Cancel booking, the You actions) is never redirected:
  // the browser would follow the 307 with the action's POST to the Log in
  // page, which has no such action, and the page could only show a
  // connection error. The action runs instead, finds no member and answers
  // "session ended" (app/members/require-member.ts), and the page sends the
  // member to Log in with "Your session ended." (B-D1). The cleared cookies
  // still go back on this response.
  if (isMembersPath && !data?.claims) {
    if (!isNavigation(request)) return supabaseResponse;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/member-login";
    loginUrl.search = "";
    const redirectResponse = NextResponse.redirect(loginUrl, 307);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  // "Not on the list." with a real 404 (B-D10): the same address renders as
  // before (the members not-found page inside the shell), only the status
  // is set here, where it still can be.
  if (isMembersPath && isPageLoad(request) && (await isMissingMembersPage(pathname, supabase, request))) {
    const notFoundResponse = NextResponse.rewrite(request.nextUrl, {
      status: 404,
      request: { headers: request.headers },
    });
    supabaseResponse.cookies.getAll().forEach((cookie) => notFoundResponse.cookies.set(cookie));
    return notFoundResponse;
  }

  return supabaseResponse;
}
