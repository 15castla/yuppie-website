#!/usr/bin/env node
// Manual recovery path for an admin who's lost the device running their
// TOTP authenticator app (see app/admin/require-admin.ts and
// app/admin/login/page.tsx for the two-factor login this supports). This
// is deliberately a standalone script run by hand with the service-role
// key, not a self-service "remove my own 2FA" button in the admin UI:
// letting a signed-in, password-only session unenroll its own second
// factor would let a stolen password alone defeat MFA. Possession of
// .env.local (and therefore SUPABASE_SECRET_KEY) is the real security
// boundary here, not anything in the web app. Do not wire this into an
// admin route or UI control.
//
// Usage:
//   node --env-file=.env.local scripts/reset-admin-mfa.mjs someone@example.com            (dry run)
//   node --env-file=.env.local scripts/reset-admin-mfa.mjs someone@example.com --confirm   (deletes)

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const email = args.find((arg) => !arg.startsWith("--"));
const confirm = args.includes("--confirm");

if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/reset-admin-mfa.mjs <email> [--confirm]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Run this with --env-file=.env.local.",
  );
  process.exit(1);
}

// Same client construction as app/admin/admin-client.ts's
// createAdminSupabaseClient(), duplicated here rather than imported:
// that file lives inside the Next app and resolves "@/" path aliases a
// plain node script has no way to follow.
const adminClient = createClient(supabaseUrl, supabaseSecretKey);

// Same approach as findAuthUserIdByEmail in
// app/admin/applications-actions.ts: the installed @supabase/auth-js
// version has no getUserByEmail(), and listUsers() takes no email/filter
// param (verified against
// node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts), so
// finding a user by email means paging through everyone and matching
// locally.
async function findUserIdByEmail(targetEmail) {
  const normalized = targetEmail.toLowerCase();
  let page = 1;

  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      console.error(`listUsers failed while looking up ${targetEmail}:`, error.message);
      process.exit(1);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;

    if (!data.nextPage) return null;
    page = data.nextPage;
  }
}

const userId = await findUserIdByEmail(email);

if (!userId) {
  console.error(`No user found for ${email}.`);
  process.exit(1);
}

// GoTrueAdminMFAApi.listFactors takes { userId }, not the bare no-arg
// call the regular (non-admin) mfa.listFactors() uses (verified against
// the same GoTrueAdminApi.d.ts / lib/types.d.ts's AuthMFAAdminListFactorsParams).
const { data: factorsData, error: factorsError } = await adminClient.auth.admin.mfa.listFactors({
  userId,
});

if (factorsError) {
  console.error(`Failed to list factors for ${email}:`, factorsError.message);
  process.exit(1);
}

const totpFactors = factorsData.factors.filter((factor) => factor.factor_type === "totp");

if (totpFactors.length === 0) {
  console.log(`No TOTP factor found for ${email}. Nothing to reset.`);
  process.exit(0);
}

console.log(`Found ${totpFactors.length} TOTP factor(s) for ${email}:`);
for (const factor of totpFactors) {
  console.log(`  - ${factor.id} (status: ${factor.status}, created: ${factor.created_at})`);
}

if (!confirm) {
  console.log("\nDry run only. Re-run with --confirm to actually delete these factors.");
  process.exit(0);
}

for (const factor of totpFactors) {
  const { error: deleteError } = await adminClient.auth.admin.mfa.deleteFactor({
    id: factor.id,
    userId,
  });

  if (deleteError) {
    console.error(`Failed to delete factor ${factor.id}:`, deleteError.message);
    process.exit(1);
  }
}

console.log(
  `\nRemoved ${totpFactors.length} factor(s) for ${email}. They can now log in with their ` +
    "password. The login page will prompt them to enroll a new authenticator automatically, " +
    "since they'll have zero verified TOTP factors.",
);
