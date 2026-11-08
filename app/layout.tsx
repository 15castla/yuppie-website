import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteWatermark } from "@/components/SiteWatermark";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";
import { NATIVE_APP_COOKIE_NAME } from "@/lib/native-app";
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
  title: "Club Yuppie: Your social life, sorted.",
  description: "Events, partner discounts and access, all planned for you. Apply to join Club Yuppie. We handle the planning. You just show up.",
  openGraph: {
    title: "Club Yuppie: Your social life, sorted.",
    description: "Events, partner discounts and access, all planned for you. Apply to join Club Yuppie. We handle the planning. You just show up.",
    url: "https://clubyuppie.com",
    siteName: "Club Yuppie",
    type: "website",
    // Share image: app/opengraph-image.png (+ .alt.txt), Next's file-based
    // metadata, which also sets its width/height/type. /apply has its own.
  },
  twitter: {
    card: "summary_large_image",
    title: "Club Yuppie: Your social life, sorted.",
    description: "Events, partner discounts and access, all planned for you. Apply to join Club Yuppie. We handle the planning. You just show up.",
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

// Marks <html data-native-app> inside the native app before the first
// paint, from the is-native-app cookie proxy.ts sets on every response
// (the same check as lib/native-app.ts's isNativeAppCookie). globals.css
// uses it to hide the website's header, which is server-rendered so the
// website doesn't jump when it hydrates, and to keep the sign-in
// watermark to the app. React never renders this attribute, hence
// suppressHydrationWarning on <html>.
const NATIVE_APP_MARKER_SCRIPT = `if(document.cookie.split(";").some(function(c){return c.trim()===${JSON.stringify(`${NATIVE_APP_COOKIE_NAME}=1`)}}))document.documentElement.setAttribute("data-native-app","")`;

// A page whose stylesheet did not arrive (Albert, 8 Nov 2026: the app opened on
// poor 4G as bare text, every heading, link and icon unstyled down the page).
// The body stays hidden until globals.css is here (its `html body` rule), so
// that is never shown; once every stylesheet has loaded or failed (without
// waiting for images), one that failed (an error, no sheet, or an empty sheet,
// which is what Chrome keeps for a failed one) or a body still hidden means the
// page loads again, at most three times in two minutes, a little later each
// time. Then, or if the
// tab cannot keep count (no sessionStorage), a plain message with Try again,
// in inline styles since the stylesheet is what is missing. The members error
// screen's words.
const STYLESHEET_GUARD_SCRIPT = `(function(){var K="cy-css-retry",bad=false,done=false;
function isCss(t){return t&&t.tagName==="LINK"&&/stylesheet/i.test(t.rel)}
function check(){if(done)return;var l=document.querySelectorAll('link[rel="stylesheet"]');for(var i=0;i<l.length;i++)if(!l[i].sheet&&!l[i].cyFailed)return;decide()}
function broken(x){if(x.cyFailed||!x.sheet)return true;try{return x.sheet.cssRules.length===0}catch(e){return false}}
document.addEventListener("error",function(e){if(isCss(e.target)){e.target.cyFailed=true;bad=true;check()}},true);
document.addEventListener("load",function(e){if(isCss(e.target))check()},true);
document.addEventListener("DOMContentLoaded",check);
addEventListener("load",decide);
function decide(){if(done)return;done=true;var l=document.querySelectorAll('link[rel="stylesheet"]');for(var i=0;i<l.length;i++)if(broken(l[i]))bad=true;
if(document.body&&getComputedStyle(document.body).visibility==="hidden")bad=true;var s={};try{s=JSON.parse(sessionStorage.getItem(K)||"{}")||{}}catch(e){}
if(!bad){if(s.n){try{sessionStorage.removeItem(K)}catch(e){}}return}
var n=Date.now()-(s.t||0)<120000?(s.n||0):0;
if(n<3){try{sessionStorage.setItem(K,JSON.stringify({n:n+1,t:Date.now()}));setTimeout(function(){location.reload()},200+n*1500);return}catch(e){}}
try{sessionStorage.removeItem(K)}catch(e){}
var d=document.createElement("div");d.setAttribute("role","alert");
d.setAttribute("style","visibility:visible;position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#ffd904;color:#1b1512;font:16px/1.4 -apple-system,system-ui,sans-serif;text-align:center");
d.innerHTML='<p style="margin:0;font-weight:800;font-size:24px">Something went wrong.</p><p style="margin:0">Check your connection and try again.</p><button type="button" style="margin-top:8px;min-height:48px;padding:0 28px;border:0;border-radius:999px;background:#1b1512;color:#ffd904;font:700 16px -apple-system,system-ui,sans-serif">Try again</button>';
d.querySelector("button").onclick=function(){location.reload()};(document.body||document.documentElement).appendChild(d)}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Duplicates globals.css's `html { background: var(--background) }`
            inline so it's present on the very first painted byte, before the
            external stylesheet has loaded. On a cold load (not a client-side
            navigation within an already-open session), iOS Safari can sample
            the toolbar safe-area strip's color before that stylesheet
            arrives, landing on the browser's own default white instead of
            the real background, and won't re-sample until the next trigger
            (scroll, reload). Keep this in sync with --background above. The
            body is hidden until globals.css arrives (STYLESHEET_GUARD_SCRIPT). */}
        <style>{`html{background:#ffd904}body{visibility:hidden}`}</style>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_APP_MARKER_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: STYLESHEET_GUARD_SCRIPT }} />
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
