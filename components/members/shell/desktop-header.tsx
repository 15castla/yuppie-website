"use client";

// Kit counterpart: k2.header(kind, active, unread). The computer header, from
// 768px: the public header's grammar. Three columns: the tab links left (15px
// bold, the current one underlined 2px), the wordmark centre (46px), your
// photo and first name right (and the messages icon on Open Invite pages).
// Sticky at the top; once the page has scrolled it shows the public site's
// 1.5px rule (a shadow, so its height never changes: RULE-22).
// The links are the tabs without Concierge.

import { Suspense, useSyncExternalStore } from "react";

import { Avatar } from "../kit/avatar";
import { KitLink } from "../kit/link";
import { ROUTES, type TabKey } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { MessagesButton } from "./messages-button";
import { useMember, useShell } from "./shell-context";
import { headerLinksFor, type TabSpec } from "./tabs";
import { Wordmark } from "./wordmark";

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

// The server (and the first render) say "not scrolled", which is also the
// state of a page that opens at its top.
function usePageScrolled(): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > 0,
    () => false,
  );
}

function MeLink({ firstName, photoUrl, blank }: { firstName: string; photoUrl: string | null; blank?: boolean }) {
  const { youCurrent } = useShell();
  return (
    <KitLink
      href={ROUTES.you}
      className="mk-me"
      aria-label={firstName ? `You, ${firstName}` : "You, your profile"}
      aria-current={youCurrent ? "page" : undefined}
    >
      {blank ? <Avatar blank size={40} /> : <Avatar photoUrl={photoUrl} name={firstName} size={40} />}
      {firstName ? <span>{firstName}</span> : null}
    </KitLink>
  );
}

function ShellMeLinkInner() {
  const member = useMember();
  return member ? (
    <MeLink firstName={member.firstName} photoUrl={member.photoUrl} />
  ) : (
    <MeLink firstName="" photoUrl={null} blank />
  );
}

export function DesktopHeader({
  tabs,
  activeTab,
  landingHref,
}: {
  tabs: TabSpec[];
  activeTab: TabKey | null;
  landingHref?: string;
}) {
  const { showMessages, messagesCurrent, unread } = useShell();
  const scrolled = usePageScrolled();
  return (
    <header className={cn("mk-hdr", scrolled && "mk-stuck")} data-needs-device-check="true">
      <div className="mk-wrap">
        <div className="mk-grid">
          <nav aria-label="Main">
            {headerLinksFor(tabs).map((tab) => (
              <KitLink
                key={tab.key}
                href={tab.href}
                aria-current={tab.key === activeTab ? "page" : undefined}
              >
                {tab.label}
              </KitLink>
            ))}
          </nav>
          <Wordmark href={landingHref} />
          <div className="mk-right">
            {showMessages ? <MessagesButton unread={unread} current={messagesCurrent} /> : null}
            <Suspense fallback={<MeLink firstName="" photoUrl={null} blank />}>
              <ShellMeLinkInner />
            </Suspense>
          </div>
        </div>
      </div>
    </header>
  );
}
