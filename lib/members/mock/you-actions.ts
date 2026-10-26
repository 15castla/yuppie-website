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

export async function previewCancel(): Promise<{ success: boolean; error?: string }> {
  assertNotProduction();
  await pause(700);
  return { success: true };
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
