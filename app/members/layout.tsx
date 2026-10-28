import { Suspense, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { MembersShell } from "@/components/members/shell/members-shell";
import { tabsFor } from "@/components/members/shell/tabs";
import { flags } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { getMemberSummary, requireMember } from "./require-member";
import MembersLoading from "./loading";
import "./members.css";

// Isolated in its own Suspense boundary, rather than awaited directly in
// MembersLayout below, so the shell around it (the phone bar or desktop
// header, the tab bar, and on iOS Safari the bottom tint that lives in the
// tab bar) can paint immediately on a cold load instead of blocking on this
// auth check first. Auth gate only: each page re-fetches the member row it
// needs via its own requireMember() call (React-cached, so one fetch per
// request), same style as app/admin/(protected)/layout.tsx does with
// requireAdmin(), so this isn't the only enforcement. It passes
// allowMissingPhoto because a layout cannot see the pathname: the photo gate
// is enforced page by page inside requireMember (see require-member.ts).
async function AuthGate({ children }: { children: ReactNode }) {
  // allowGated for the same reason: the membership gate (A-D4) is also
  // enforced page by page, so the gate page and the help pages can open.
  await requireMember({ allowMissingPhoto: true, allowGated: true });
  return children;
}

export default async function MembersLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Cookie and User-Agent only: no I/O, so the shell is not held up by it.
  const mode = await detectShellMode();
  const tabs = tabsFor({ mode, flags });

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
      {/* The member (name and photo) is a promise, not awaited here: the
          shell paints now and the photo arrives into its fixed 44px slot. */}
      <MembersShell
        mode={mode}
        tabs={tabs}
        member={getMemberSummary()}
        messagesEnabled={flags.messages}
      >
        <Suspense fallback={<MembersLoading />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </MembersShell>
    </div>
  );
}
