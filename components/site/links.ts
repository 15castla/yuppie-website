// Outside links the homepage footer lists that aren't live yet. While a
// URL is null the footer shows that item greyed out with a "Soon" tag and
// no link; fill one in and it becomes a normal link there.
export const EXTERNAL_LINKS: Record<
  "instagram" | "tiktok" | "appStore" | "googlePlay",
  { label: string; url: string | null }
> = {
  instagram: { label: "Instagram", url: null },
  tiktok: { label: "TikTok", url: null },
  appStore: { label: "App Store", url: null },
  googlePlay: { label: "Google Play", url: null },
};

export const CONTACT_EMAIL = "hello@clubyuppie.com";

// The company behind Yuppie, for the homepage footer's legal line. While
// either is null the footer shows "© {year} Yuppie. All rights reserved.";
// with both set it shows the registered company line instead.
export const COMPANY = { name: null as string | null, number: null as string | null };

export const REGISTERED_OFFICE = "3rd Floor, 45 Albemarle Street, Mayfair, London W1S 4JL";

// The company that runs the club and holds members' data (project doc Company_Details.md, 1 Nov 2026), for the
// privacy policy. Kept apart from COMPANY above, which switches the homepage footer's legal line and is still off.
export const LEGAL_ENTITY = { name: "Club Yuppie Ltd", number: "17530492" } as const;
