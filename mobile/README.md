# Yuppie mobile shell

A [Capacitor](https://capacitorjs.com) native wrapper around
clubyuppie.com — not a separate app, a WebView pointed at the live site,
with a native shell around it (icons, splash screen, status bar styling,
external-link handling, an offline screen). It's an independent project
with its own `package.json`; nothing under it is part of the Next.js app
in the repo root.

**The appId (`com.clubyuppie.app`) is a placeholder.** It's what
`capacitor.config.ts` and both native projects are currently generated
with, but it hasn't been finalized against an Apple/Google developer
account yet. Changing it later means regenerating both native projects
(`npx cap add ios` / `android` again over a fresh `appId`), not just
editing the config file, since the bundle ID is baked into project files
on both platforms. Store submission itself (developer accounts, final
bundle ID, signing, listings) is out of scope for what's here.

## Running it

```sh
cd mobile
npm install
npx cap sync   # or: npm run sync — see below
npx cap open ios      # opens Xcode
npx cap open android  # opens Android Studio
```

From Xcode/Android Studio, just build and run onto a simulator/emulator
or a connected device as normal.

### Pointing at something other than production

By default the app loads `https://clubyuppie.com`. To point it at a local
dev server or a Vercel preview instead, set `CAPACITOR_SERVER_URL` before
syncing:

```sh
CAPACITOR_SERVER_URL=https://my-preview.vercel.app npx cap sync
```

For a local Next.js dev server, use your machine's actual LAN IP, not
`localhost` — the simulator/device is a separate network context and
`localhost` there means *itself*, not your computer (e.g.
`http://192.168.1.23:3000`; run `ipconfig getifaddr en0` to find yours on
macOS). Run `npx cap sync` again (no env var) to go back to production.

### `npm run sync`

Use this instead of a bare `npx cap sync` — it also re-stamps
`www-placeholder/offline.html`'s retry button with whichever URL
`CAPACITOR_SERVER_URL` (or its production default) currently resolves to,
so "Try again" on the offline screen returns to the right environment.
Plain `npx cap sync` still works, it just leaves that retry link on
whatever it was last set to.

### Regenerating icons/splash screens

The source is `assets/logo.png` (a copy of
`public/yuppie_app_icon_1024.png` from the repo root — re-copy it there
if the site's own icon changes, then):

```sh
npm run assets
```

This runs `@capacitor/assets` in "easy mode" against that one source
image plus `#FFD904` as the background color for both icons (Android's
adaptive-icon background layer) and splash screens, writing directly into
`ios/` and `android/`.

## What's actually implemented

- **`capacitor.config.ts`** — appId/appName/backgroundColor, `server.url`
  (env-overridable, see above), `server.allowNavigation` (Stripe +
  Supabase hosts — see below), `server.errorPath` (the offline screen —
  see below), and `plugins.StatusBar` (dark status bar content on both
  platforms, applied automatically by each platform's StatusBar plugin at
  launch — no native code needed for this part).

- **External links** (`ios/App/App/ExternalLinkPlugin.swift`,
  `android/.../ExternalLinkPlugin.java`) — a small custom native plugin
  per platform, hooking Capacitor's own `shouldOverrideLoad` extension
  point (every registered plugin gets a say before Capacitor's default
  navigation handling runs). Anything on clubyuppie.com, `*.stripe.com`,
  or `*.supabase.co` loads normally in the main WebView; anything else
  opens in an in-app browser sheet (SFSafariViewController on iOS, Chrome
  Custom Tabs on Android — the same thing `@capacitor/browser`'s own
  `open()` call would show, implemented directly against each platform's
  APIs rather than through that plugin's JS API, since there's no web JS
  context on the app's own pages to call it *from* — the WebView loads
  clubyuppie.com directly, unmodified). Stripe/Supabase are explicitly
  excluded from this precisely because payment confirmation and login
  callbacks need to finish in the same WebView the page's own JS is
  running in, not get cancelled out to a browser sheet mid-flow.

- **Offline screen** (`www-placeholder/offline.html`, `server.errorPath`
  in the config) — Capacitor's own built-in navigation-failure handling
  (already present on both platforms, no custom code needed) loads this
  bundled page automatically whenever the initial load of `server.url`
  fails outright, no-connectivity being the main case. The page itself
  uses `@capacitor/network` to check connectivity for its "Try again"
  button, and auto-retries the instant a `networkStatusChange` event
  reports the connection is back.

- **Android nav bar / status bar color** — `android/app/src/main/res/values/colors.xml`
  didn't exist in the stock `cap add android` template despite
  `styles.xml` referencing `@color/colorPrimary` and friends (which would
  have failed to build) — added, set to the brand yellow. The system
  navigation bar color and its icon contrast
  (`android:navigationBarColor` / `android:windowLightNavigationBar`) are
  set directly in `styles.xml`'s `AppTheme.NoActionBar`, since there's no
  Capacitor plugin config for the nav bar the way there is for the status
  bar.

## What's NOT verified

Steps 7 and 8 of the original task — iOS Simulator screenshots across a
few pages, and confirming a logged-in member survives a force-quit — need
a real Xcode + iOS Simulator, neither of which are available in the
sandboxed environment this was built in (only Xcode Command Line Tools,
no `xcodebuild`, no `simctl`, no CocoaPods). Everything above compiled
correctly in review and follows each platform's documented Capacitor
patterns, but none of it has actually been built and run. Before treating
this as done:

1. Open `mobile/ios/App/App.xcworkspace`... actually there's no
   `.xcworkspace` yet since CocoaPods/SPM resolution hasn't run — Xcode
   will prompt to resolve Swift Package dependencies the first time you
   open `ios/App/App.xcodeproj`. Let that finish, then build onto a
   simulator.
2. Check the home page, an event detail page, and the Discounts page —
   specifically the *top* of the screen, not just the bottom. A Capacitor
   WebView has no native toolbar at all (unlike Safari, which always
   reserves some chrome), so if any page's top content relies on
   assuming a toolbar is there rather than on its own
   `env(safe-area-inset-top)` CSS, it'll sit closer to the notch/Dynamic
   Island than intended.
3. Log in as a member, force-quit the app (swipe it away in the app
   switcher, not just background it), reopen it, and confirm it goes
   straight to the members area rather than back to the login screen.
   This should work automatically — Capacitor's WebView uses a normal
   persistent cookie store by default and nothing here changes that — but
   "should" isn't "confirmed."

If something doesn't look right in that pass, the most likely places to
look first are `plugins.StatusBar` / the `styles.xml` nav bar items for
anything visual, or `ExternalLinkPlugin`'s `isInAppHost` allowlist if a
Stripe/Supabase flow unexpectedly bounces to the browser sheet.
