"use server";

// The App Review account's two steps (lib/server/review-login.ts): whether an address is it (so no email is sent),
// and its sign-in with the fixed code. Both answer plainly for every other address and when switched off.

import { isReviewAccount, reviewSignIn, type ReviewSignIn } from "@/lib/server/review-login";

export async function checkReviewAccount(address: string): Promise<boolean> {
  return isReviewAccount(address);
}

export async function signInReviewAccount(address: string, code: string): Promise<ReviewSignIn> {
  return reviewSignIn(address, code);
}
