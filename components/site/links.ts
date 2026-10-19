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
