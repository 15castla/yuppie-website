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
  await supabase.auth.getClaims();

  return supabaseResponse;
}
