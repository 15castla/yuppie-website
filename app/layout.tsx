import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteWatermark } from "@/components/SiteWatermark";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://clubyuppie.com"),
  title: "Yuppie - Your Social Life, Curated",
  description: "Curated events, partner discounts and access across London. Apply to join Yuppie, we’ll handle the planning, you just show up.",
  openGraph: {
    title: "Yuppie - Your Social Life, Curated",
    description: "Curated events, partner discounts and access across London. Apply to join Yuppie, we’ll handle the planning, you just show up.",
    url: "https://clubyuppie.com",
    siteName: "Yuppie",
    type: "website",
    // Share image: app/opengraph-image.png (+ .alt.txt), Next's file-based
    // metadata, which also sets its width/height/type. /apply has its own.
  },
  twitter: {
    card: "summary_large_image",
    title: "Yuppie - Your Social Life, Curated",
    description: "Curated events, partner discounts and access across London. Apply to join Yuppie, we’ll handle the planning, you just show up.",
    // Share image: app/twitter-image.png (+ .alt.txt).
  },
  // Browser and search-engine icons are the files app/favicon.ico (16, 32
  // and 48px; Next adds its <link> automatically) and app/icon.png (512px):
  // Google needs a square icon of at least 48px. icon.png is still listed
  // here because in this Next version (16.3.1) file-based icon/apple-icon
  // files are only added to <head> when there's no `icons` object at all
  // (lib/metadata/resolve-metadata.js), and this one is needed for the
  // apple touch icon below.
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [
      {
        url: "/yuppie_app_badge_y.png",
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  },
};

// iOS Safari otherwise auto-samples page edge pixels to color its own
// chrome (address bar / bottom toolbar), which can land on a nearby
// element's background (e.g. the members nav bar's cream) instead of the
// actual page background, so an explicit theme-color pins it to the real
// --background value everywhere.
//
// NOTE: theme-color is NOT what colors the bottom Safari toolbar on
// member pages. Confirmed by a control test where the server-verified
// value was set to pure red (#FF0000) and the toolbar stayed yellow with
// zero visible change. The toolbar there appears to be a frosted/blurred
// layer sampling the actual page pixels behind it, not reading this meta
// tag (see the gradient-flat-zone fix in members-nav.tsx). Reverted to
// the real brand value.
export const viewport: Viewport = {
  themeColor: "#FFD904",
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Duplicates globals.css's `html { background: var(--background) }`
            inline so it's present on the very first painted byte, before the
            external stylesheet has loaded. On a cold load (not a client-side
            navigation within an already-open session), iOS Safari can sample
            the toolbar safe-area strip's color before that stylesheet
            arrives, landing on the browser's own default white instead of
            the real background, and won't re-sample until the next trigger
            (scroll, reload). Keep this in sync with --background above. */}
        <style>{`html{background:#ffd904}`}</style>
      </head>
      <body className="relative min-h-full flex flex-col bg-background text-foreground">
        <SiteWatermark />
        {/* Rendered here, outside app/template.tsx's animated wrapper, so
            the nav doesn't remount and replay the page-entrance fade/slide
            on every client-side navigation (it used to live inside each
            page's own markup, which that wrapper re-mounts on every route
            change). */}
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
