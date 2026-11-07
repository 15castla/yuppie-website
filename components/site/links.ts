// Outside links for the homepage footer. While a URL is null the footer
// leaves that item out (and a column with nothing live in it); fill one in
// and it appears there as a normal link.
export const EXTERNAL_LINKS: Record<
  "instagram" | "tiktok" | "appStore" | "googlePlay",
  { label: string; url: string | null }
> = {
  instagram: { label: "Instagram", url: "https://www.instagram.com/clubyuppie/" },
  tiktok: { label: "TikTok", url: null },
  appStore: { label: "App Store", url: null },
  googlePlay: { label: "Google Play", url: null },
};

export const CONTACT_EMAIL = "hello@clubyuppie.com";

// The company behind Club Yuppie, for the homepage footer's legal line
// (project doc Company_Details.md). While either is null the footer shows
// "© {year} Club Yuppie. All rights reserved."; with both set it shows the
// registered company line.
export const COMPANY = { name: "Club Yuppie Ltd" as string | null, number: "17530492" as string | null };

export const REGISTERED_OFFICE = "3rd Floor, 45 Albemarle Street, Mayfair, London W1S 4JL";

// The company that runs the club and holds members' data (project doc Company_Details.md, 1 Nov 2026), for the
// privacy policy. Kept apart from COMPANY above, which switches the homepage footer's legal line.
export const LEGAL_ENTITY = { name: "Club Yuppie Ltd", number: "17530492" } as const;
