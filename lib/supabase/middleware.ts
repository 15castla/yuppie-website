import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
  const { pathname } = request.nextUrl;
  const isMembersPath = pathname === "/members" || pathname.startsWith("/members/");
  if (isMembersPath && !data?.claims) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/member-login";
    loginUrl.search = "";
    const redirectResponse = NextResponse.redirect(loginUrl, 307);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return supabaseResponse;
}
