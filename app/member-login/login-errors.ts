// Telling the login errors apart (r2a sections 6 and 7, brief 5.5). Shared by the website's form and the app's
// (member-login-form.tsx, member-login-form-native.tsx): their looks stay separate, but both must read Supabase
// Auth's answers the same way. Pure: no React.
//
// What supabase-js 2.112 (@supabase/auth-js) hands back, checked against the local Auth server (GoTrue v2.177,
// tests/e2e/phase-a/10-member-flows.mjs):
//   - fetch failed (offline, DNS, CORS): AuthRetryableFetchError, status 0            -> network
//   - a 5xx from Auth: AuthRetryableFetchError with that status                       -> generic
//   - otherwise AuthApiError with `code` (API version 2024-01-01) and `status`:
//       signInWithOtp, shouldCreateUser false, an email with no account:
//                      422 otp_disabled ("Signups not allowed for otp")             -> not recognised (+ the A-D5 line)
//       a code asked for again too soon: 429 over_email_send_rate_limit             -> too many attempts
//       too many requests from one place: 429 over_request_rate_limit                -> too many attempts / tries
//       verifyOtp, a wrong code AND an expired code: 403 otp_expired ("Token has expired or is invalid").
// Auth gives the same code for a wrong code and an expired one, so the form tells them apart by the clock: a
// code is good for CODE_LIFETIME_MS from when it was sent (C-D5: Supabase's otp_expiry is 600 seconds); after
// that "expired", before it "wrong". Auth also answers otp_disabled for an address that is not an email at all,
// so the form checks the shape first ("That doesn't look like a valid email address.").

/** How long a login code lasts (decision C-D5; supabase/config.toml otp_expiry = 600). */
export const CODE_LIFETIME_MS = 10 * 60 * 1000;

export type SendErrorKey = "required" | "invalid" | "not-found" | "rate" | "network" | "generic";
export type VerifyErrorKey = "code-required" | "wrong" | "expired" | "too-many" | "network" | "generic";

type AuthErrorLike = { name?: string; code?: string; status?: number; message?: string } | null | undefined;

/** A plain shape check, so an address Auth would call "not recognised" is first called "not an email". */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNetwork(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError" && (error.status === 0 || error.status === undefined)) return true;
  return offline() && error.name !== "AuthApiError";
}

function isRateLimited(error: AuthErrorLike): boolean {
  return error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit" || error?.status === 429;
}

/** signInWithOtp (Send login code, Send a new code). */
export function classifySendError(error: AuthErrorLike): SendErrorKey {
  if (isNetwork(error)) return "network";
  if (isRateLimited(error)) return "rate";
  const code = error?.code;
  if (code === "otp_disabled" || code === "signup_disabled" || code === "user_not_found") return "not-found";
  if (code === "email_address_invalid" || code === "validation_failed") return "invalid";
  return "generic";
}

/** verifyOtp. `sentAt` is when the code now in use was sent (Date.now()), null if not known. */
export function classifyVerifyError(error: AuthErrorLike, sentAt: number | null, now: number = Date.now()): VerifyErrorKey {
  if (isNetwork(error)) return "network";
  if (isRateLimited(error)) return "too-many";
  const code = error?.code;
  if (code === "otp_expired" || code === "invalid_credentials" || code === "validation_failed" || error?.status === 403) {
    return sentAt !== null && now - sentAt >= CODE_LIFETIME_MS ? "expired" : "wrong";
  }
  return "generic";
}

/** B-D1: where Log out and an expired session land (/member-login?state=...). */
export type LoginNotice = "logged-out" | "session-ended";

export function noticeFrom(value: string | string[] | undefined): LoginNotice | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "logged-out" || v === "session-ended" ? v : null;
}

/** The notice's two lines (r2b section 7). */
export const NOTICE_WORDS: Record<LoginNotice, { title: string; body: string }> = {
  "logged-out": { title: "You’re logged out.", body: "Log back in whenever you like." },
  "session-ended": { title: "Your session ended.", body: "Log in again to carry on." },
};
