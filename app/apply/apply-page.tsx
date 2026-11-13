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
export const APPLY_METADATA: Metadata = {
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

// A nomination link (/apply/albert-7k2q, 13 Nov 2026; the first links were /apply?n=ALBERT-7K2Q and still work):
// "Albert nominated you." and the code filled in. A code with no nominations left says so (they can still apply);
// one we don't know is ignored.
export async function nominationFrom(raw: string | string[] | undefined): Promise<ApplyNomination | null> {
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

/** The application form, with the nomination a link or code brought (/apply?n= and /apply/<code> both draw this). */
export async function ApplyPageBody({ code }: { code: string | string[] | undefined }) {
  const [result, nomination] = await Promise.all([createCardSetupIntent(), nominationFrom(code)]);
  return (
    <ApplyForm
      clientSecret={result.success ? result.clientSecret : null}
      setupError={result.success ? null : result.error}
      nominations={flags.nominations}
      nomination={nomination}
    />
  );
}
