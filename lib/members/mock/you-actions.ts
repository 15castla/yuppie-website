"use server";

// EXAMPLE DATA: invented people and places, for the preview harness only (assertNotProduction: a 404 on the live site, always)
//
// Stand-ins for the real server actions (app/members/profile/actions.ts),
// used by the preview harness only so a screen can be clicked through with no
// login and no database: nothing here reads or writes anything. Each one
// refuses on the live site (assertNotProduction), always, even when example screens are switched on there.

import { assertNotProduction } from "@/lib/members/mock/guard";
import { EXAMPLE_PHOTO_CROP } from "@/lib/members/mock/photo-examples";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function previewSignOut(): Promise<void> {
  assertNotProduction();
}

// Cancel membership, step 1: the example end date and the example retreat after it (D8).
export async function previewCancelPreview(): Promise<{ ok: true; until: string; bookingsAfterEnd: { title: string; when: string }[] }> {
  assertNotProduction();
  await pause(300);
  return { ok: true, until: "12 Nov", bookingsAfterEnd: [{ title: "Sunrise Wellness Retreat", when: "Sun 15 Nov" }] };
}

// Cancel membership, step 2.
export async function previewRequestCancel(): Promise<{ ok: true; until: string }> {
  assertNotProduction();
  await pause(700);
  return { ok: true, until: "12 Nov" };
}

// Keep my membership.
export async function previewKeep(): Promise<{ ok: true }> {
  assertNotProduction();
  await pause(700);
  return { ok: true };
}

// Keep my membership, failing (the Stripe call did not go through).
export async function previewKeepFails(): Promise<{ ok: false; error: string }> {
  assertNotProduction();
  await pause(500);
  return { ok: false, error: "Your membership is still set to end. Try again." };
}

// Delete my account: the preview never deletes anything, so it says so as an error.
export async function previewDeleteAccount(): Promise<{ ok: false; error: string }> {
  assertNotProduction();
  await pause(700);
  return { ok: false, error: "This is the preview: nothing was deleted." };
}

export async function previewUpload(): Promise<{ success: boolean; error?: string; url?: string }> {
  assertNotProduction();
  await pause(900);
  return { success: true, url: EXAMPLE_PHOTO_CROP };
}

export async function previewUploadFails(): Promise<{ success: boolean; error?: string; url?: string }> {
  assertNotProduction();
  await pause(600);
  return { success: false, error: "Your photo didn’t upload. Check your connection and try again." };
}

export async function previewRemovePhoto(): Promise<{ success: boolean; error?: string }> {
  assertNotProduction();
  return { success: true };
}

export async function previewUpdateProfile(): Promise<{ success: boolean; error?: string }> {
  assertNotProduction();
  await pause(700);
  return { success: true };
}

export async function previewRequestEmailChange(): Promise<{ success: boolean; error?: string }> {
  assertNotProduction();
  await pause(500);
  return { success: true };
}

// The example code is 123456; anything else is wrong.
export async function previewVerifyEmailChange(
  sentTo: "new" | "current",
  code: string,
): Promise<{ status: "done"; email: string } | { status: "needs_other_code" } | { status: "error"; error: string }> {
  assertNotProduction();
  await pause(500);
  if (code !== "123456") return { status: "error", error: "That code is wrong or has expired. Send a new code." };
  return sentTo === "new" ? { status: "done", email: "sam.taylor@example.com" } : { status: "done", email: "sam.taylor@example.com" };
}
