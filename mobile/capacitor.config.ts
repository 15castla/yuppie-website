import type { CapacitorConfig } from "@capacitor/cli";

// appId ("com.clubyuppie.app") is confirmed final — registered as the App
// ID in the Apple Developer account used for App Store submission. Do not
// change it: that would mean regenerating the iOS/Android native projects
// (cap add again), not just editing this file, since the bundle ID is
// baked into project files on both platforms — and a real App Store
// Connect app record keys off this exact value once one exists.
const config: CapacitorConfig = {
  appId: "com.clubyuppie.app",
  appName: "Yuppie",
  // Required by Capacitor's config schema even though it's unused here:
  // server.url below points the WebView at a live server instead of
  // bundling a local web build, so nothing is ever read from this dir.
  webDir: "www-placeholder",
  // Marks every request the native app's WebView makes so proxy.ts can tell
  // native traffic apart from ordinary browser visitors and redirect it to
  // the members area (see the User-Agent check in proxy.ts at the repo
  // root).
  appendUserAgent: "YuppieNativeApp",
  ios: {
    // Capacitor's documented default here is "never" (see
    // node_modules/@capacitor/cli/dist/declarations.d.ts), which maps
    // straight to WKWebView.scrollView.contentInsetAdjustmentBehavior =
    // .never (see CAPBridgeViewController.swift's prepareWebView). With
    // that, the WebView never reports the Dynamic Island/notch safe area
    // to the page at all — env(safe-area-inset-top) resolves to 0
    // instead of ~59pt, so components/members/ui.tsx's
    // pt-[calc(2rem+var(--safe-top))] silently falls back to its
    // 2rem floor, squashing the Members Area header up against the
    // status bar. "automatic" is the standard UIKit behavior and the
    // documented fix for exactly this: it makes the WebView report real
    // safe-area insets, so that existing CSS (which assumes it will)
    // actually works as designed.
    contentInset: "automatic",
  },
  server: {
    // Defaults to the members area so a plain `npx cap sync && npx cap
    // open ios` with no env var sends builds straight to the native app's
    // members-only entry point on clubyuppie.com. Override with
    // CAPACITOR_SERVER_URL to point at localhost (e.g.
    // "http://192.168.1.x:3000", a real LAN IP, since the iOS
    // simulator/device can't reach "localhost" meaning *this* machine) or
    // a Vercel preview URL during development.
    url: process.env.CAPACITOR_SERVER_URL || "https://clubyuppie.com/member-login",
    androidScheme: "https",
    // Hosts beyond the primary server.url above that should still load
    // inside the main WebView rather than being treated as "external" (see
    // ios/App/App/ExternalLinkPlugin.swift and
    // android/.../ExternalLinkPlugin.java, which open anything NOT covered
    // by server.url or this list in an in-app browser sheet instead).
    // Stripe's payment confirmation (3D Secure challenges, Apple/Google
    // Pay) and Supabase's own auth redirect endpoints both need to
    // complete in the same WebView the app's own JS is running in, not
    // bounce out — cancelling that navigation would break the in-flight
    // payment/login.
    allowNavigation: ["*.stripe.com", "*.supabase.co"],
    // Loaded automatically (by Capacitor's own built-in WKNavigationDelegate
    // / WebViewClient failure handling, on both platforms, no custom code
    // needed) whenever the main-frame load of server.url fails outright —
    // most commonly no connectivity at all. www-placeholder/offline.html's
    // own retry button re-checks via @capacitor/network and returns to
    // server.url once a connection is back.
    errorPath: "offline.html",
  },
  backgroundColor: "#FFD904",
  // Read by each platform's StatusBar plugin at launch (its load()
  // lifecycle method applies this automatically — see
  // node_modules/@capacitor/status-bar/{ios,android}) so no native code is
  // needed just to set an initial style. Style.Light ("LIGHT") means dark
  // text/icons, which is what a bright yellow background needs for
  // contrast — the naming refers to the background the status bar expects
  // to sit on, not the icon color itself. overlaysWebView: true keeps the
  // WebView genuinely edge-to-edge under the status bar (a Capacitor
  // WebView has no native toolbar to push content down like Safari does),
  // so the site's own env(safe-area-inset-top) CSS is what provides top
  // clearance, the same mental model as installed-PWA/fullscreen Safari —
  // not a second, separately-colored native bar stacked above it.
  plugins: {
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#FFD904",
      overlaysWebView: true,
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: "#FFD904",
      // The generic system spinner this would otherwise show (a plain
      // UIActivityIndicatorView on iOS, a ProgressBar on Android's legacy
      // splash fallback) is replaced by a bespoke comet-ring animation
      // instead — see ios/App/App/CometSpinnerView.swift (wired up in
      // SceneDelegate.swift, since a launch screen storyboard can't host
      // a custom-class view) and, on Android,
      // android/.../java/com/clubyuppie/app/CometRingView.java (shown via
      // a separate Dialog window in MainActivity.java, since Capacitor's
      // own splash mechanism there delays the Activity's normal content
      // view from drawing at all for the whole splash window — a plain
      // overlay view would never render during it).
      showSpinner: false,
    },
  },
};

export default config;
