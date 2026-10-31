import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  isNativeAppUserAgent,
  NATIVE_APP_COOKIE_NAME,
} from "@/lib/native-app";
import {
  isMaintenancePath,
  MAINTENANCE_HEADER,
  MAINTENANCE_TEST_HEADER,
  maintenanceOn,
} from "@/lib/maintenance";

const NATIVE_APP_REDIRECT_PATHS = new Set([
  "/",
  "/contact",
  "/faq",
  "/apply",
  "/privacy",
]);

// The Supabase session cookie (@supabase/ssr): sb-<project>-auth-token, or
// its chunks .0, .1 ... when the session is long. Not the PKCE
// -code-verifier cookie, which is not a session.
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

// Maintenance (r2b section 6; lib/maintenance.ts): members addresses show
// "Back in a moment." with a 503 while MAINTENANCE_MODE=on. A rewrite, so the
// address stays the one the member asked for and Try again (a reload) brings
// them back to it once the switch is off. Never /admin, /api, the public site
// or the login page.
function maintenanceResponse(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(MAINTENANCE_HEADER, "1");
  return NextResponse.rewrite(new URL("/maintenance", request.url), {
    status: 503,
    headers: { "Retry-After": "300", "Cache-Control": "no-store" },
    request: { headers: requestHeaders },
  });
}

// Session ended (decision B-D1 B): a members page that finds an auth cookie
// but no valid session (expired past refreshing, signed out elsewhere,
// banned, forged) sends the member to Log in with "Your session ended."
// rather than silently. Someone who was never logged in (no auth cookie) gets
// the plain Log in page, as before. updateSession() decides the redirect and
// copies any cookies it cleared onto it; this only adds the reason. The
// cookie is looked for before updateSession() runs, because clearing a dead
// session also blanks it in request.cookies.
function hadAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => AUTH_COOKIE.test(cookie.name) && cookie.value);
}

function withSessionEnded(request: NextRequest, hadSession: boolean, response: NextResponse): NextResponse {
  const location = response.headers.get("location");
  if (!hadSession || !location || response.status !== 307 || !isMaintenancePath(request.nextUrl.pathname)) return response;
  const target = new URL(location, request.url);
  if (target.pathname !== "/member-login" || target.search) return response;
  target.searchParams.set("state", "session-ended");
  response.headers.set("location", target.toString());
  return response;
}

export async function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const isNative = isNativeAppUserAgent(userAgent);
  const { pathname } = request.nextUrl;

  const response =
    isMaintenancePath(pathname) && maintenanceOn(process.env, request.headers.get(MAINTENANCE_TEST_HEADER))
      ? maintenanceResponse(request)
      : isNative && NATIVE_APP_REDIRECT_PATHS.has(pathname)
        ? NextResponse.redirect(new URL("/member-login", request.url))
        : withSessionEnded(request, hadAuthCookie(request), await updateSession(request));

  // Set on every response (not just the redirects above) so client code
  // — see SiteNav — can read native-app-ness from document.cookie instead
  // of navigator.userAgent. See lib/native-app.ts for why that avoids a
  // real WKWebView cold-launch race the previous approach had.
  // Only when the browser does not already hold the right value: a cookie set
  // on a server action's response makes Next mark the action as revalidated
  // (x-action-revalidated), and the client router then refreshes the page and
  // drops its prefetches after every action, the open chat's poll every few
  // seconds included. The cookie a browser holds is the same either way.
  const nativeCookie = request.cookies.get(NATIVE_APP_COOKIE_NAME)?.value;
  if (isNative) {
    if (nativeCookie !== "1") {
      response.cookies.set(NATIVE_APP_COOKIE_NAME, "1", {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
      });
    }
  } else if (nativeCookie !== undefined) {
    response.cookies.delete(NATIVE_APP_COOKIE_NAME);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
