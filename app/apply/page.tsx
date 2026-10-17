import type { Metadata } from "next";

import ApplyForm from "./apply-form";
import { createCardSetupIntent } from "./actions";

const TITLE = "Apply to Yuppie";
const DESCRIPTION = "Apply to join. We'll handle the planning, you just show up.";

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
    siteName: "Yuppie",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const result = await createCardSetupIntent();

  return (
    <ApplyForm
      clientSecret={result.success ? result.clientSecret : null}
      setupError={result.success ? null : result.error}
    />
  );
}
