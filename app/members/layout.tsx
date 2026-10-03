import { Suspense, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { MembersNav, MembersBottomBar } from "@/components/members/members-nav";
import { requireMember } from "./require-member";
import MembersLoading from "./loading";

// Isolated in its own Suspense boundary, rather than awaited directly in
// MembersLayout below, so the shell around it (MembersNav,
// MembersBottomBar, and on iOS Safari the bottom safe-area tinting strip
// that lives inside MembersBottomBar) can paint immediately on a cold
// load instead of blocking on this auth check first. Auth gate only:
// each page re-fetches the member row it needs via its own
// requireMember() call, same style as app/admin/(protected)/layout.tsx
// does with requireAdmin(), so this isn't the only enforcement.
async function AuthGate({ children }: { children: ReactNode }) {
  await requireMember();
  return children;
}

export default function MembersLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex min-h-dvh flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section className="relative flex flex-1 flex-col">
        <MembersNav />
        <Suspense fallback={<MembersLoading />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
        <MembersBottomBar />
      </section>
    </div>
  );
}
