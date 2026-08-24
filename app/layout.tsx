import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Yuppie - Too Fun to Stay Home",
  description: "Apply to join, we'll handle the planning, you just show up.",
  openGraph: {
    title: "Yuppie - Too Fun to Stay Home",
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
    title: "Yuppie - Too Fun to Stay Home",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
