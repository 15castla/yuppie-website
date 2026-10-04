import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  isNativeAppUserAgent,
  NATIVE_APP_COOKIE_NAME,
} from "@/lib/native-app";

const NATIVE_APP_REDIRECT_PATHS = new Set([
  "/",
  "/contact",
  "/faq",
  "/apply",
  "/privacy",
]);

export async function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const isNative = isNativeAppUserAgent(userAgent);

  const response =
    isNative && NATIVE_APP_REDIRECT_PATHS.has(request.nextUrl.pathname)
      ? NextResponse.redirect(new URL("/member-login", request.url))
      : await updateSession(request);

  // Set on every response (not just the redirects above) so client code
  // — see SiteNav — can read native-app-ness from document.cookie instead
  // of navigator.userAgent. See lib/native-app.ts for why that avoids a
  // real WKWebView cold-launch race the previous approach had.
  if (isNative) {
    response.cookies.set(NATIVE_APP_COOKIE_NAME, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  } else {
    response.cookies.delete(NATIVE_APP_COOKIE_NAME);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
