import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
