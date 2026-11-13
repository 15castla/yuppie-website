import type { Metadata } from "next";

import { flags } from "@/lib/members/flags";
import { lookupNominationCode } from "@/lib/server/nominations";
import ApplyForm, { type ApplyNomination } from "./apply-form";
import { createCardSetupIntent } from "./actions";

const TITLE = "Apply to Club Yuppie";
const DESCRIPTION = "Apply to join. We handle the planning. You just show up.";

// Nested openGraph/twitter objects replace the root layout's rather than
// merging with them, so every field a link preview shows is spelled out
// here. The share images are the file-based app/apply/opengraph-image.png
// and twitter-image.png.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://clubyuppie.com/apply",
    siteName: "Club Yuppie",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const dynamic = "force-dynamic";

// A nomination link (/apply?n=ALBERT-7K2Q, 12 Nov 2026): "Albert nominated you." and the code filled in. A code
// with no nominations left says so (they can still apply); one we don't know is ignored.
async function nominationFrom(raw: string | string[] | undefined): Promise<ApplyNomination | null> {
  if (!flags.nominations || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const found = await lookupNominationCode(raw);
    if (found.ok) return { code: raw.trim().toUpperCase(), firstName: found.firstName, usable: true };
    return found.reason === "used" ? { code: null, firstName: null, usable: false } : null;
  } catch (err) {
    console.error("apply: reading the nomination code failed:", err);
    return null;
  }
}

export default async function ApplyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [result, query] = await Promise.all([createCardSetupIntent(), searchParams]);
  const nomination = await nominationFrom(query.n);

  return (
    <ApplyForm
      clientSecret={result.success ? result.clientSecret : null}
      setupError={result.success ? null : result.error}
      nominations={flags.nominations}
      nomination={nomination}
    />
  );
}
