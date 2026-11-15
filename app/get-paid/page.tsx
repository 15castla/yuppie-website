import type { Metadata } from "next";

import { StandaloneScreen } from "@/components/members/system/standalone";
import { SystemScreen } from "@/components/members/system/system-screen";

// Back from Stripe's Get paid pages, in the app (15 Nov 2026). Stripe's hosted onboarding only works in a real
// browser, so the app opens it in the in-app browser (Safari), which comes back here, outside the app's own login.
// Nothing to do but close it: the app's Payments page asks Stripe for the new status when it shows again.
export const metadata: Metadata = { title: "Get paid", robots: { index: false } };

export default async function GetPaidBackPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const expired = (await searchParams).expired === "1";
  return (
    <StandaloneScreen>
      <SystemScreen
        title={expired ? "That link" : "You’re back"}
        accent={expired ? "ran out." : "from Stripe."}
        lead={
          expired
            ? "Stripe’s links only last a few minutes. Close this and tap Continue to Stripe again in Club Yuppie."
            : "Close this to carry on in Club Yuppie. Your Payments page shows where Get paid is up to."
        }
        actions={null}
        art="rope"
        floor="own"
      />
    </StandaloneScreen>
  );
}
