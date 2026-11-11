import { Suspense, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { MembersShell } from "@/components/members/shell/members-shell";
import { PushBridge } from "@/components/members/push/push-bridge";
import { tabsFor } from "@/components/members/shell/tabs";
import { flags, messagesOn } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import type { ShellMode } from "@/components/members/shell/types";
import { pushLiveFor } from "@/lib/server/config";
import { getMemberSummary, requireMember } from "./require-member";
import { Main } from "@/components/members/kit/main";
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
//
// In the app, where push is live for the member, it also draws PushBridge: the
// phone's notifications (permission, device token, taps, the one-time offer).
async function AuthGate({ children, mode }: { children: ReactNode; mode: ShellMode }) {
  // allowGated for the same reason: the membership gate (A-D4) is also
  // enforced page by page, so the gate page and the help pages can open.
  const member = await requireMember({ allowMissingPhoto: true, allowGated: true });
  return (
    <>
      {children}
      {mode === "app" && pushLiveFor(member.email) ? <PushBridge /> : null}
    </>
  );
}

// A cold load only (the app opening, a link from outside): the shell paints at
// once and this plain <main aria-busy="true"> sits in it until the page is
// ready. No spinner: the iOS app's launch picture
// (mobile/ios/App/App/SceneDelegate.swift) hides once a <main> that is not
// aria-busy exists and no "animate-spin" element is on the page. Moving
// between members pages never shows it: there are no loading screens (7 Nov
// 2026, whole pages only), so the current page stays until the next one is
// ready (components/members/kit/link.tsx).
function ColdLoad() {
  return (
    <Main busy>
      <span className="mk-sr">Loading</span>
    </Main>
  );
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
        messagesEnabled={messagesOn(mode)}
      >
        <Suspense fallback={<ColdLoad />}>
          <AuthGate mode={mode}>{children}</AuthGate>
        </Suspense>
      </MembersShell>
    </div>
  );
}
