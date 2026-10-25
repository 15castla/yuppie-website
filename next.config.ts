import type { NextConfig } from "next";

// Where /members goes: Open Invite once its flag is on, else Events. The same
// rule as landingPath() in lib/members/routes.ts, spelled out here because
// the config cannot import app code that touches next/navigation.
const MEMBERS_LANDING =
  process.env.NEXT_PUBLIC_MEMBERS_OPEN_INVITE === "on"
    ? "/members/open-invite"
    : "/members/events";

const nextConfig: NextConfig = {
  // There is no members Home page. Redirected before anything renders, so a
  // cold load or the app's launch (which opens /members) goes straight to the
  // landing page with no shell flash. The old profile page is now You.
  async redirects() {
    return [
      { source: "/members", destination: MEMBERS_LANDING, permanent: false },
      { source: "/members/profile", destination: "/members/you", permanent: false },
    ];
  },
  images: {
    // Event photos uploaded at /admin/events live in Supabase Storage's
    // public bucket. Listing it lets next/image (EventThumbnail in
    // components/members/ui.tsx) serve them resized for each slot instead
    // of at full upload size.
    remotePatterns: [
      new URL("https://tbcpzmzfxtbaumlcnmdf.supabase.co/storage/v1/object/public/**"),
    ],
  },
  experimental: {
    // Keep visited dynamic pages (every /members page) in the client router
    // cache for 30s, so going back to a tab shows it instantly instead of
    // re-rendering on the server behind the loading screen. Actions that
    // change what a member sees call revalidatePath("/members", "layout")
    // (app/members/events/actions.ts, app/members/profile/actions.ts),
    // which clears it; admin forms call router.refresh() after saving.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
