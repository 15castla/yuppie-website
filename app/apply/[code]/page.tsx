import type { Metadata } from "next";

import { APPLY_METADATA, ApplyPageBody } from "../apply-page";

// A member's nomination link, /apply/albert-7k2q (13 Nov 2026): the application form with "Albert nominated you."
// and their code filled in. Kept out of search results; the page it shares is /apply.
export const metadata: Metadata = {
  ...APPLY_METADATA,
  alternates: { canonical: "/apply" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function NominatedApplyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let raw = code;
  try {
    raw = decodeURIComponent(code);
  } catch {
    // A link with a stray % in it: read as it is (an unknown code is simply ignored).
  }
  return <ApplyPageBody code={raw} />;
}
