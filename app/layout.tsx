import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteWatermark } from "@/components/SiteWatermark";
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
  description: "Apply to join, we'll handle the planning, you just show up.",
  openGraph: {
    title: "Yuppie - Your Social Life, Curated",
    description: "Apply to join, we'll handle the planning, you just show up.",
    url: "https://clubyuppie.com",
    siteName: "Yuppie",
    type: "website",
    images: [
      {
        url: "/yuppie_app_icon_1024.png",
        width: 1024,
        height: 1024,
        alt: "Yuppie",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Yuppie - Your Social Life, Curated",
    description: "Apply to join, we'll handle the planning, you just show up.",
    images: ["/yuppie_app_icon_1024.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/yuppie_app_icon_32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      {
        url: "/yuppie_app_icon_1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  },
};

// iOS Safari otherwise auto-samples page edge pixels to color its own
// chrome (address bar / bottom toolbar), which can land on a nearby
// element's background (e.g. the members nav bar's cream) instead of the
// actual page background — an explicit theme-color pins it to the real
// --background value everywhere.
export const viewport: Viewport = {
  themeColor: "#FFD904",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SiteWatermark />
        {children}
      </body>
    </html>
  );
}
