import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var openingScreen: OpeningScreenView?
    // Each readiness poll and "Still loading." timer carries the number it was started with; Try again starts new
    // ones, and the old ones stop when they see the number has moved on.
    private var pollGeneration = 0
    private var slowGeneration = 0

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        startupLog("SceneDelegate.scene(_:willConnectTo:) entered")
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // The gap between here and addOpeningScreen() below (bridge/WebView
        // creation via makeKeyAndVisible(), which has been measured
        // taking anywhere from ~1s to several seconds on a cold
        // Simulator boot, and is not bounded by anything in this file)
        // has no splash overlay in it yet — Capacitor's own SplashScreen
        // view and our OpeningScreenView are both added later in this
        // method. Without an explicit background, that gap renders
        // whatever UIWindow's default is (black), which is exactly the
        // "black screen, then the yellow spinner appears" symptom from
        // the cold-launch investigation: not the splash/loading-indicator
        // logic itself, but the bare window underneath it before either
        // splash layer exists. Matches Base.lproj/LaunchScreen.storyboard's
        // imageView backgroundColor (1, 0.8509803921568627,
        // 0.01568627450980392) so there's no visible seam versus the
        // system launch screen it replaces.
        window?.backgroundColor = UIColor(
            red: 1.0, green: 0.8509803921568627, blue: 0.01568627450980392, alpha: 1.0
        )
        startupLog("creating CAPBridgeViewController")
        let bridgeVC = CAPBridgeViewController()
        startupLog("CAPBridgeViewController created")
        window?.rootViewController = bridgeVC
        startupLog("calling makeKeyAndVisible (triggers loadView/bridge+webview init)")
        window?.makeKeyAndVisible()
        startupLog("makeKeyAndVisible returned — bridge non-nil: \(bridgeVC.bridge != nil), webView non-nil: \(bridgeVC.webView != nil)")

        observeCapacitorViewDidAppear()
        disableScrollViewTouchDelay(on: bridgeVC)
        enableSwipeBack(on: bridgeVC)
        fixSafeAreaInsetFirstFrame(on: bridgeVC)
        // Before the readiness polling below, so there is always an opening
        // screen for it to hide.
        addOpeningScreen(to: bridgeVC)
        hideSplashWhenWebViewReady(on: bridgeVC)
        registerExternalLinkPlugin(on: bridgeVC)

        startupLog("scene(_:willConnectTo:) about to call SceneDelegateProxy")
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        startupLog("scene(_:willConnectTo:) returning")
    }

    // UIScrollView defaults to delaysContentTouches = true: before handing
    // any touch to content — any on-page button included — it holds it for
    // roughly 150ms first, purely to rule out "is this actually the start
    // of a scroll" before committing. That's a separate delay from the
    // double-tap-to-zoom disambiguation touch-action: manipulation (set on
    // the offline screen's button, and worth having everywhere else too)
    // already removes in CSS — this one is pure UIKit, underneath WebKit,
    // and nothing in CSS/JS can reach it. It's the actual remaining cause
    // of on-page buttons feeling slow to react, confirmed by elimination
    // once the CSS-level fix alone wasn't enough. false here affects every
    // page this WebView ever loads, not just the offline screen.
    private func disableScrollViewTouchDelay(on bridgeVC: CAPBridgeViewController) {
        bridgeVC.webView?.scrollView.delaysContentTouches = false
    }

    // Swipe in from the left edge to go back (Albert, 8 Nov 2026: "You should be able to side swipe off of to the
    // side as a back button"), as in Safari; from the right edge, forward again. WKWebView's own gesture: it goes
    // through the web view's history, which includes the site's own page changes (Next's client navigations are
    // history entries), and shows the previous page sliding back in. Off by default in a WKWebView.
    private func enableSwipeBack(on bridgeVC: CAPBridgeViewController) {
        bridgeVC.webView?.allowsBackForwardNavigationGestures = true
    }

    // Works around a real, long-standing WebKit bug (webkit.org/b/191872),
    // not anything specific to this app: a fresh WKWebView's scroll view
    // gets an initial layout pass with contentInset still 0 (the safe
    // area isn't known yet), and is *supposed* to get a follow-up update
    // once UIKit resolves it — but on a freshly-created WKWebView
    // attached right at app launch, that follow-up update can race with
    // the page's own load and never fire, permanently leaving
    // env(safe-area-inset-top) at 0 for that page's lifetime. That's
    // exactly our symptom: correct after any scroll (which forces
    // WebKit to recompute), wrong on a cold launch's first paint, and —
    // per independent testing — correct even at rest on an
    // already-running instance (i.e. the inset value and CSS math are
    // both right; only the first-load delivery of that value is lossy).
    //
    // mobile/capacitor.config.ts's ios.contentInset: "automatic" makes
    // UIScrollView.adjustedContentInset resolve to the real safe area at
    // all (see that key's own comment) — but doesn't control whether
    // WKWebView successfully *tells the page* about it in time. This
    // polls adjustedContentInset directly (rather than observing it via
    // KVO — tried that first; confirmed by direct testing that
    // WKWebView's internal scroll view does NOT reliably fire KVO change
    // notifications for this property, so a .new-observing closure can
    // silently never run at all) until it becomes non-zero (a pure UIKit
    // geometry property, resolved independently of whatever the page's
    // own network load is doing, so this typically resolves well before
    // the page finishes loading).
    //
    // What happens once it's non-zero has already gone through two
    // failed iterations, BOTH confirmed via real-device tests (not
    // Simulator, which never reproduces this bug at all) to correctly
    // update adjustedContentInset natively, while the live page's own
    // getComputedStyle(...).paddingTop stayed stuck at the 2rem floor
    // regardless, both times:
    //   1. Cycling contentInsetAdjustmentBehavior off and back to
    //      .automatic (a workaround reported for this same WebKit bug).
    //   2. A genuine two-dispatch-cycle scrollView.contentOffset nudge
    //      (down 1pt, a real run-loop turn later back to zero) — the
    //      programmatic equivalent of the hand-drag confirmed to fix it.
    // Neither reaches WebKit's CSS environment variables on this
    // device/iOS version. The working theory: WebKit's safe-area CSS
    // recompute may specifically key off the real
    // UIPanGestureRecognizer-driven touch-scroll path, not any
    // programmatic contentOffset/contentInset change however it's
    // triggered or scheduled — simulating an actual touch gesture from
    // native code is fragile enough to not be worth attempting.
    //
    // So this stops trying to coax WebKit's own (apparently broken, on
    // this build) env(safe-area-inset-top) delivery into working, and
    // sidesteps it instead: native code already knows the correct inset
    // value, resolved independently of the page's network load — so it
    // hands that value to the page directly, overriding the CSS outcome
    // rather than depending on WebKit to compute it correctly. A
    // WKUserScript at .atDocumentStart injection time runs before the
    // page's own CSS/JS on every navigation (including the SPA's own
    // client-side route changes, not just the first cold-launch load),
    // appending a <style> tag that defines --native-safe-area-inset-top on
    // :root. app/globals.css's --safe-top prefers that over env(), and
    // each page adds --safe-top on top of its own top padding — so pages
    // keep their own spacing (2rem for the members area, 7rem for
    // member-login) below the inset, exactly as they render below the
    // status bar in Safari. (This used to hard-set every <main>'s
    // padding-top to max(2rem, inset + 30pt) with !important, which
    // matched the members pages but squashed member-login's larger
    // padding to the same 92pt.)
    //
    // The injected value isn't adjustedContentInset.top, though — that
    // was tried first and, measured pixel-for-pixel against the real
    // website, overshot by ~16pt: a UIScrollView's adjusted content
    // inset can accumulate other contributions beyond the pure safe
    // area (additionalSafeAreaInsets etc.). adjustedContentInset is
    // still used as the polling signal above (it's proven reliable for
    // *timing* — resolves non-zero almost immediately, independent of
    // the page's network load), but the actual injected value comes
    // from bridgeVC.view.window's own safeAreaInsets.top instead — a
    // UIWindow's safe area insets are a direct reflection of
    // hardware/orientation geometry (status bar/Dynamic Island, home
    // indicator), not a scroll view's accumulated adjustment.
    //
    // contentInsetAdjustmentBehavior = .automatic (set in
    // capacitor.config.ts — necessary for adjustedContentInset and
    // window.safeAreaInsets to resolve at all) makes UIScrollView apply
    // its *own* native contentOffset shift to visually reveal the inset,
    // same as any ordinary scroll view — independent of, and additive
    // with, this CSS injection; confirmed via a real-device test where
    // the measured gap swung between a 16pt overshoot and a 32pt
    // undershoot across two otherwise-identical runs with the exact same
    // injected CSS value, consistent with that native shift's timing
    // being non-deterministic. Explicitly pinning
    // contentInsetAdjustmentBehavior to .never and contentOffset to
    // .zero here removes that native contribution entirely, leaving
    // 100% of visible clearance to the CSS injection alone — matching
    // this WebView's stated architecture (see capacitor.config.ts's
    // StatusBar comment: edge-to-edge natively, clearance from CSS only,
    // never a second native layer of it). Safe to do unconditionally:
    // window.safeAreaInsets.top (what's actually injected) doesn't
    // depend on contentInsetAdjustmentBehavior at all — only a scroll
    // view's own adjustedContentInset does.
    //
    // forMainFrameOnly: true keeps this from touching Stripe/Supabase
    // iframe content (see ExternalLinkPlugin.swift's isInAppHost comment
    // for why those load inline rather than externally).
    //
    // The injected value is the raw hardware safe area. An earlier
    // version added a fixed 30pt "Safari chrome buffer" on top, to match
    // the ~92pt the members pages show in Safari. That gap was really the
    // members pages' own 2rem padding, which Safari stacks below the
    // status bar (measured in Simulator Safari: env(safe-area-inset-top)
    // is 0 and the page starts below the 62pt status bar). Pages now add
    // their own padding themselves, so the members area still lands at
    // 62 + 32 = 94pt.
    //
    // Polls every 10ms for up to 1.2s (120 attempts) — generous relative
    // to how fast this value actually resolves in practice (observed
    // within the first couple of polls, i.e. ~10-20ms), so this is a
    // ceiling against a genuinely stuck case, not a tuned budget.
    private func fixSafeAreaInsetFirstFrame(on bridgeVC: CAPBridgeViewController, attempt: Int = 0) {
        guard let webView = bridgeVC.webView else { return }
        let topInset = webView.scrollView.adjustedContentInset.top
        if topInset > 0 {
            let windowInset = bridgeVC.view.window?.safeAreaInsets.top ?? 0
            let insetPx = Int(windowInset.rounded())
            startupLog("fixSafeAreaInsetFirstFrame: adjustedContentInset.top = \(topInset) after \(attempt) poll(s); window.safeAreaInsets.top = \(windowInset); injecting --native-safe-area-inset-top: \(insetPx)px")

            // Removes any native contentOffset contribution .automatic
            // might otherwise apply on its own (see the comment above) —
            // all visible top clearance should come from the CSS
            // injection below alone.
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            webView.scrollView.contentOffset = .zero

            let css = ":root { --native-safe-area-inset-top: \(insetPx)px; }"
            let cssLiteral = (try? JSONEncoder().encode(css)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
            let js = """
            (function() {
                var style = document.createElement('style');
                style.setAttribute('data-native-safe-area-fix', 'true');
                style.textContent = \(cssLiteral);
                document.documentElement.appendChild(style);
            })();
            """
            let userScript = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            webView.configuration.userContentController.addUserScript(userScript)
            return
        }
        guard attempt < 120 else {
            startupLog("fixSafeAreaInsetFirstFrame: gave up after \(attempt) polls, adjustedContentInset.top never became non-zero")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) { [weak self, weak bridgeVC] in
            guard let self, let bridgeVC else { return }
            self.fixSafeAreaInsetFirstFrame(on: bridgeVC, attempt: attempt + 1)
        }
    }

    // capacitor.config.ts's SplashScreen.launchAutoHide: true +
    // launchShowDuration: 3000 would hide the native splash on a flat 3s
    // timer, whether or not the page is on screen yet. This replaces that
    // timer with the real signal: hide the splash (our OpeningScreenView,
    // whose line finishes drawing first) as soon as the server-rendered
    // page has painted.
    //
    // Deliberately does NOT touch capacitor.config.ts's launchAutoHide/
    // launchShowDuration to do this — that config is shared with Android,
    // whose own splash mechanism (see MainActivity.java's showCometRing)
    // is a completely different implementation that also reads
    // launchAutoHide to decide whether to ever unblock its content view
    // at all; flipping it off globally would leave Android's content
    // permanently hidden unless its native code were also changed to
    // match. Instead this calls SplashScreen.hide() explicitly, early,
    // via the same public JS API a Capacitor-aware website would call
    // itself — confirmed safe by reading SplashScreen.swift directly:
    // hideSplash() checks `if !isVisible { return }` before doing
    // anything, so the original timer (which can't be cancelled — it's
    // a bare asyncAfter closure, not a cancellable DispatchWorkItem) is
    // reduced to a harmless no-op once this has already fired.
    //
    // Polling starts straight away, as the WebView begins its first
    // navigation, rather than waiting for WKWebView.isLoading to go false
    // as it used to. isLoading only goes false once the whole streamed
    // page and every subresource (~1MB of JS, CSS and images) has
    // finished, which measured as most of the splash time (3-4s on a cold
    // Simulator launch, 1.3s warm) while the page itself was already
    // painted. Showing the server-rendered page as soon as it's there is
    // the point. The trade-off: for a moment after the splash fades, the
    // page may still be starting its JavaScript, so a very fast tap may
    // do nothing.
    //
    // "Painted" is checked as: a <main> exists that isn't the members
    // area's loading screen (app/members/loading.tsx and the events ones
    // render an empty <main aria-busy="true">; hiding onto those would
    // only swap the splash for plain yellow), isn't still inside the
    // <div hidden> React streams finished content into just before
    // swapping it in, and no [class*="animate-spin"] element is on the
    // page (anywhere in the document: nothing in the members shell uses
    // that marker outside explicit user actions, which can't have
    // happened yet). That covers the member pages, the sign-in screen
    // and the members error screen without naming any of them. A
    // signed-out launch opens /members, gets redirected to
    // /member-login, and so hides on the sign-in screen, not on the
    // redirecting page's loading state.
    //
    // A slow connection (Albert, 8 Nov 2026, a fresh install on train wifi:
    // the opening screen finished, then "just a yellow page"). This used to
    // hide the opening screen after 10s whatever the page was doing, and
    // until the page and its stylesheets arrived the web view had nothing to
    // draw but plain yellow, with no sign anything was happening. Now the
    // check answers one of three things:
    //   "ready"    as above (a real <main>, no spinner), and the page can be
    //              seen: hide.
    //   "drawn"    the page can be seen but isn't "ready" (a spinner, a part
    //              still streaming in): hide once 10s have passed, as the
    //              old cap did, since the page is there to look at.
    //   "waiting"  nothing to see yet: keep the opening screen.
    // "Can be seen" means the body exists and isn't hidden. The website keeps
    // the body hidden until its stylesheet is here (app/layout.tsx,
    // STYLESHEET_GUARD_SCRIPT), and while any stylesheet in <head> is still
    // on its way the browser holds back everything after it, so there is no
    // body yet either. The website's own "Something went wrong." message
    // (the guard's, a full-screen role="alert" on the body when the
    // stylesheet keeps failing) counts as ready, so it is shown.
    // www-placeholder/offline.html has a <main> and no hidden body, so the
    // offline screen is ready at once.
    //
    // After 20s with the opening screen still up, it says "Still loading."
    // with Try again, which loads the start page again (scheduleStillLoading).
    // Polling carries on throughout, every 0.1s for the first 20s, then every
    // 0.25s, until the opening screen goes.
    private static let readinessCheckJS = """
        (function () {
          var body = document.body;
          if (!body) return 'waiting';
          if (document.querySelector('body > div[role="alert"][style*="2147483647"]')) return 'ready';
          if (getComputedStyle(body).visibility === 'hidden') return 'waiting';
          var main = document.querySelector('main:not([aria-busy="true"])');
          if (main != null && !main.closest('[hidden]') &&
            document.querySelector('[class*="animate-spin"]') == null) return 'ready';
          return 'drawn';
        })()
        """

    private func hideSplashWhenWebViewReady(on bridgeVC: CAPBridgeViewController) {
        guard let webView = bridgeVC.webView else { return }
        // TEMPORARY — part of the startupLog timing set.
        startupLog("hideSplashWhenWebViewReady: readiness polling started")
        pollGeneration += 1
        waitForContentThenHideSplash(on: webView, startedAt: Date(), generation: pollGeneration)
    }

    private func waitForContentThenHideSplash(on webView: WKWebView, startedAt: Date, generation: Int, attempt: Int = 0) {
        guard openingScreen != nil, generation == pollGeneration else { return }
        webView.evaluateJavaScript(Self.readinessCheckJS) { [weak self, weak webView] result, _ in
            guard let self, let webView, self.openingScreen != nil, generation == self.pollGeneration else { return }
            let state = Self.heldForTest() ? "waiting" : ((result as? String) ?? "waiting")
            let waited = Date().timeIntervalSince(startedAt)
            if state == "ready" || (state == "drawn" && waited >= 10) {
                // TEMPORARY — part of the startupLog timing set.
                startupLog("waitForContentThenHideSplash: \(state) after \(attempt) poll(s), \(String(format: "%.1f", waited))s, hiding the opening screen")
                self.hideSplash(on: webView)
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + (waited < 20 ? 0.1 : 0.25)) { [weak self, weak webView] in
                guard let self, let webView else { return }
                self.waitForContentThenHideSplash(on: webView, startedAt: startedAt, generation: generation, attempt: attempt + 1)
            }
        }
    }

    // For checking the slow path in the Simulator without a slow network:
    //   SIMCTL_CHILD_YUPPIE_TEST_HOLD_OPENING=25 xcrun simctl launch booted com.clubyuppie.app
    // treats the page as not there for the first 25s after launch. Debug builds only: always false in a release build.
    private static func heldForTest() -> Bool {
        #if DEBUG
        if let hold = ProcessInfo.processInfo.environment["YUPPIE_TEST_HOLD_OPENING"].flatMap({ Double($0) }),
           ProcessInfo.processInfo.systemUptime - appStartUptime < hold {
            return true
        }
        #endif
        return false
    }

    // "Still loading." after 20s, with Try again (see readinessCheckJS's comment). Try again loads the start page again
    // (capacitor.config.ts's server.url, as at launch: a load that has stalled is replaced by a new one), hides the
    // message, and starts the polling and the 20s again.
    private func scheduleStillLoading(on bridgeVC: CAPBridgeViewController, after seconds: TimeInterval) {
        slowGeneration += 1
        let generation = slowGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self, weak bridgeVC] in
            guard let self, let bridgeVC, generation == self.slowGeneration, let screen = self.openingScreen else { return }
            startupLog("opening screen: still waiting after \(Int(seconds))s, showing Still loading")
            screen.showStillLoading { [weak self, weak bridgeVC] in
                guard let self, let bridgeVC else { return }
                self.tryAgain(on: bridgeVC)
            }
        }
    }

    private func tryAgain(on bridgeVC: CAPBridgeViewController) {
        guard let webView = bridgeVC.webView, let screen = openingScreen else { return }
        startupLog("opening screen: Try again, loading the start page again")
        screen.hideStillLoading()
        if let url = bridgeVC.bridge?.config.appStartServerURL {
            _ = webView.load(URLRequest(url: url))
        } else {
            _ = webView.reload()
        }
        pollGeneration += 1
        waitForContentThenHideSplash(on: webView, startedAt: Date(), generation: pollGeneration)
        scheduleStillLoading(on: bridgeVC, after: 20)
    }

    private func hideSplash(on webView: WKWebView?) {
        webView?.evaluateJavaScript("window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen && window.Capacitor.Plugins.SplashScreen.hide()")

        guard let screen = openingScreen else { return }
        openingScreen = nil
        pollGeneration += 1
        slowGeneration += 1
        // Capacitor's own splash fades underneath straight away (unseen:
        // ours covers it). Ours first lets its line run out to the edge
        // (0.15-0.35s), then fades over capacitor.config.ts's
        // launchFadeOutDuration (300ms), as the old splash image and ring did.
        screen.finish {
            UIView.animate(withDuration: 0.3, delay: 0, options: .curveLinear, animations: {
                screen.alpha = 0
            }, completion: { _ in
                screen.removeFromSuperview()
            })
        }
    }

    // TEMPORARY — see AppDelegate.swift's startupLog definition. Posted
    // by CAPBridgeViewController.viewDidAppear, so this pins down whether
    // the view hierarchy itself ever actually appears on screen,
    // separately from whether the webview's content loads.
    private func observeCapacitorViewDidAppear() {
        NotificationCenter.default.addObserver(
            forName: .capacitorViewDidAppear,
            object: nil,
            queue: .main
        ) { _ in
            startupLog("notification: capacitorViewDidAppear")
        }
    }

    // ExternalLinkPlugin.swift is compiled directly into this target (not
    // a separate npm Capacitor plugin package), so it's invisible to
    // `npx cap sync`'s plugin discovery: generateIOSPackageJSON (see
    // node_modules/@capacitor/cli/dist/util/iosplugin.js) only scans the
    // .ios.path directory of plugins resolved from package.json
    // dependencies, and writes the result into
    // ios/App/App/capacitor.config.json's "packageClassList" — the ONLY
    // list CapacitorBridge.registerPlugins() (see
    // node_modules/@capacitor/ios's CapacitorBridge.swift) auto-registers
    // from on this Capacitor version (8.5.2). There's no Objective-C
    // runtime scan fallback anymore, and no supported way to add a
    // same-target local class to that generated list, so a plugin
    // compiled into the app but absent from it is simply never
    // instantiated — its shouldOverrideLoad is never consulted, and
    // hand-editing the generated JSON wouldn't survive the next sync
    // regardless.
    //
    // registerPluginInstance(_:) is CapacitorBridge's own public,
    // supported escape hatch for exactly this: manual instance
    // registration, independent of packageClassList and
    // autoRegisterPlugins entirely (unlike registerPluginType(_:), which
    // is a no-op whenever autoRegisterPlugins is true — the default).
    // This is the direct iOS counterpart of Android's own explicit
    // registerPlugin(ExternalLinkPlugin.class) call in MainActivity.java,
    // which is exactly why Android was never affected by this bug: it
    // never relied on any generated/scanned list in the first place.
    // bridgeVC.bridge is non-nil once bridgeVC.view has been accessed
    // (CAPBridgeViewController.loadView() constructs it synchronously),
    // which window.makeKeyAndVisible() above already triggers.
    private func registerExternalLinkPlugin(on bridgeVC: CAPBridgeViewController) {
        startupLog("registerExternalLinkPlugin: start")
        guard let bridge = bridgeVC.bridge else {
            CAPLog.print("⚡️ ❌ ExternalLinkPlugin not registered: bridge was nil")
            startupLog("registerExternalLinkPlugin: bridge was nil")
            return
        }
        bridge.registerPluginInstance(ExternalLinkPlugin())
        startupLog("registerExternalLinkPlugin: done")
    }

    // Capacitor's own native SplashScreen view (LaunchScreen.storyboard's
    // Splash image) is auto-hidden by a flat capacitor.config.ts
    // launchShowDuration (3000ms) timer that can't be cancelled (see
    // hideSplashWhenWebViewReady's comment — confirmed via
    // SplashScreen.swift's source) and isn't safe to change globally
    // either, since it's shared with Android, whose splash mechanism has
    // no equivalent of this app's own early-hide logic and would simply
    // show its splash longer on every launch, fast or slow, if this were
    // increased. So on a page that takes longer than 3s to be ready —
    // routine in testing (6-20s, sometimes more, depending on network) —
    // Capacitor's own splash disappears on schedule regardless. Confirmed
    // live with the old splash: the wordmark disappeared and the loading
    // indicator went on alone on plain yellow.
    //
    // So the opening screen runs under our own control instead:
    // OpeningScreenView shows the same Splash image full screen, stacked
    // above whatever Capacitor's splash does (when that fades at the 3s
    // mark, nothing visibly changes), with the line the figures stand on
    // drawing itself as the loading indicator. hideSplash fades it once
    // real content is actually ready, not on a timer.
    //
    // It is added as a subview of the bridge view controller's view, the
    // same way Capacitor's SplashScreen plugin adds its own views
    // (capacitor.config.ts sets showSpinner: false so Capacitor adds no
    // spinner of its own). It can't live in LaunchScreen.storyboard: a
    // launch screen can't host a custom-class view at all — ibtool rejects
    // it outright ("Launch screens may not set custom classnames"), a hard
    // platform restriction on the first native-only frame, and nothing
    // there can animate anyway. The storyboard shows the same picture
    // without the line, so the hand-over has no seam. An explicit high
    // zPosition keeps it above whatever Capacitor adds afterward,
    // regardless of the exact timing of its plugin-load lifecycle relative
    // to this method. Where the line goes (the figures' feet, at any
    // screen size or orientation) is worked out in OpeningScreenView.
    private func addOpeningScreen(to bridgeVC: CAPBridgeViewController) {
        startupLog("addOpeningScreen: start")
        let screen = OpeningScreenView()
        screen.translatesAutoresizingMaskIntoConstraints = false
        screen.layer.zPosition = 999
        bridgeVC.view.addSubview(screen)
        NSLayoutConstraint.activate([
            screen.topAnchor.constraint(equalTo: bridgeVC.view.topAnchor),
            screen.bottomAnchor.constraint(equalTo: bridgeVC.view.bottomAnchor),
            screen.leadingAnchor.constraint(equalTo: bridgeVC.view.leadingAnchor),
            screen.trailingAnchor.constraint(equalTo: bridgeVC.view.trailingAnchor)
        ])
        openingScreen = screen
        // Independent of the polling (which needs the page to answer its
        // JavaScript): if the opening screen is still up after 20s, it says
        // "Still loading." with Try again. It used to go after 11s whatever
        // happened, onto plain yellow when the page wasn't there yet.
        scheduleStillLoading(on: bridgeVC, after: 20)
        startupLog("addOpeningScreen: done")
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
