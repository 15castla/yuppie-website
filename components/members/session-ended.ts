// The session ended while a members page was open (decision B-D1 B: "Your session ended."). Shared by the
// server actions and the pages that call them; pure, no React, no server imports.
//
// The proxy never redirects a server action (lib/supabase/middleware.ts): a member action that finds no
// member answers SESSION_ENDED instead (app/members/require-member.ts memberForAction), and the page that
// called it sends the browser to Log in with the notice. A full page load rather than a router push, so
// nothing of the dead session stays in the page.

export type SessionEnded = { sessionEnded: true };

export const SESSION_ENDED: SessionEnded = { sessionEnded: true };

/** Log in with "Your session ended." (app/member-login/login-errors.ts NOTICE_WORDS). */
export const SESSION_ENDED_LOGIN = "/member-login?state=session-ended";

export function isSessionEnded(value: unknown): value is SessionEnded {
  return typeof value === "object" && value !== null && (value as { sessionEnded?: unknown }).sessionEnded === true;
}

/** The page's half: off to Log in with the notice. */
export function goToSessionEnded(): void {
  window.location.assign(SESSION_ENDED_LOGIN);
}
