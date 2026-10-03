import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const NATIVE_APP_REDIRECT_PATHS = new Set([
  "/",
  "/contact",
  "/faq",
  "/apply",
  "/privacy",
]);

export async function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (
    userAgent.includes("YuppieNativeApp") &&
    NATIVE_APP_REDIRECT_PATHS.has(request.nextUrl.pathname)
  ) {
    return NextResponse.redirect(new URL("/member-login", request.url));
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
