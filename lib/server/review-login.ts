import "server-only";

// The App Review account (3 Nov 2026). Members log in with a code sent by email, which Apple's reviewers cannot
// receive, so one account, and only that one, takes a fixed code instead. Both halves are server-only Vercel
// variables, set for Production by the release and removable at any time:
//   REVIEW_LOGIN_EMAIL  the review account's address (an existing, active member)
//   REVIEW_LOGIN_CODE   six digits, given to Apple in the App Review notes
// With either missing (and everywhere they are not set), nothing here does anything and login is exactly as before.
// Only in the app (the review is of the app), and only for a member marked members.is_review_account (set by
// release/review-account.mjs), never an admin: a real member's address put in REVIEW_LOGIN_EMAIL by mistake does
// nothing. No email is sent for that address. Every try takes a row first, under one database lock
// (review_login_take_try), so tries sent at the same time cannot slip past the limit: ten not-successful tries in an
// hour, or thirty in a day, and no more are taken, right code or not, until they age out (a six-digit code would
// otherwise be guessable). Use an address nobody could guess, and remove both variables after the review.
//
// Signing in: Supabase's admin API makes a one-time magic-link token for the account (nothing is emailed), and the
// request's own server client verifies it, which sets the normal session cookies. The member is then an ordinary
// member: every gate (membership, photo, rules) applies.

import { timingSafeEqual } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { detectShellMode } from "@/lib/members/shell-mode";
import { serviceDb } from "./db";

const CODE = /^\d{6}$/;

export type ReviewSignIn = "ok" | "wrong" | "locked" | "failed" | "not-review";

function reviewConfig(): { email: string; code: string } | null {
  const email = (process.env.REVIEW_LOGIN_EMAIL ?? "").trim().toLowerCase();
  const code = (process.env.REVIEW_LOGIN_CODE ?? "").trim();
  if (!email || !CODE.test(code)) return null;
  return { email, code };
}

/** Whether this address is the App Review account, asked in the app with both variables set. */
export async function isReviewAccount(address: unknown): Promise<boolean> {
  const config = reviewConfig();
  if (!config || typeof address !== "string") return false;
  if (address.trim().toLowerCase() !== config.email) return false;
  if ((await detectShellMode()) !== "app") return false;
  return Boolean(await reviewMemberId(config.email));
}

/** The member marked as the App Review account with this address, and not an admin; else null. */
async function reviewMemberId(email: string): Promise<string | null> {
  const db = serviceDb();
  const { data, error } = await db.from("members").select("id").eq("email", email).eq("is_review_account", true).is("deleted_at", null).limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  const id = data[0].id as string;
  const { data: admin, error: adminError } = await db.from("admin_users").select("id").eq("id", id).maybeSingle();
  if (adminError) throw adminError;
  return admin ? null : id;
}

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Takes one try, under the database's lock: its row id, or null when the limit is reached. */
async function takeTry(): Promise<number | null> {
  const { data, error } = await serviceDb().rpc("review_login_take_try");
  if (error) throw error;
  return (data as number | null) ?? null;
}

/** The review account's sign-in with its fixed code: sets the session cookies on "ok". */
export async function reviewSignIn(address: unknown, code: unknown): Promise<ReviewSignIn> {
  const config = reviewConfig();
  try {
    if (!config || !(await isReviewAccount(address))) return "not-review";
    const attempt = await takeTry();
    if (attempt === null) return "locked";
    const ok = typeof code === "string" && sameCode(code.trim(), config.code);
    const { error: logError } = await serviceDb().from("review_login_attempts").update({ ok }).eq("id", attempt);
    if (logError) throw logError;
    if (!ok) return "wrong";

    const { data, error } = await serviceDb().auth.admin.generateLink({ type: "magiclink", email: config.email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error("reviewSignIn: making the sign-in token failed:", error);
      return "failed";
    }
    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (verifyError) {
      console.error("reviewSignIn: signing in failed:", verifyError);
      return "failed";
    }
    console.info("reviewSignIn: the App Review account signed in");
    return "ok";
  } catch (err) {
    console.error("reviewSignIn failed:", err);
    return "failed";
  }
}
