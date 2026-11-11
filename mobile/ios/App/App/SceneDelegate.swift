import UIKit
import UserNotifications
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var openingScreen: OpeningScreenView?
    // Each readiness poll and "Still loading." timer carries the number it was started with; Try again starts new
    // ones, and the old ones stop when they see the number has moved on.
    private var pollGeneration = 0
    // Swipe right from anywhere to go back (SwipeBack, below).
    private var swipeBack: SwipeBack?
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
        installSwipeBack(on: bridgeVC)
        if let webView = bridgeVC.webView {
            // Phone notifications: the page's questions and tapped notifications (AppDelegate.swift, PushBridge).
            PushBridge.shared.attach(to: webView)
            // And the notification centre's delegate stays PushBridge: Capacitor's bridge, just created, takes it for
            // its own router unless capacitor.config.ts says handleApplicationNotifications: false (and a build
            // whose capacitor.config.json predates that would still do so).
            UNUserNotificationCenter.current().delegate = PushBridge.shared
        }
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

    // Swipe right to go back (Albert, 8 Nov 2026: "You should be able to side swipe off of to the side as a back
    // button"; 9 Nov, after trying WKWebView's own edge gesture: "nowhere near as responsive as something like
    // instagram ... mainly that the swipe is hard to get started"). From anywhere on the page, not just the edge:
    // see SwipeBack at the end of this file. Not while the opening screen is up.
    private func installSwipeBack(on bridgeVC: CAPBridgeViewController) {
        guard let webView = bridgeVC.webView else { return }
        swipeBack = SwipeBack(webView: webView, isPaused: { [weak self] in self?.openingScreen != nil })
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
        // A notification tapped to open the app opens its page now the first page is on screen.
        PushBridge.shared.pageIsReady()
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

// MARK: - Swipe back, as in Instagram

/// Swipe right from anywhere on a page to go back (Albert, 9 Nov 2026: match Instagram, "mainly that the swipe is
/// hard to get started"). WKWebView's own gesture (allowsBackForwardNavigationGestures) only starts from the very
/// edge of the screen; this one starts wherever the finger is, once it moves more sideways than up or down.
///
/// While the finger moves, the page as it is now slides right with it (a still picture of it, so it follows the
/// finger exactly), and the page before shows underneath, slightly shaded, from a picture taken while it was on
/// screen. Let go past a third of the way, or flick: the page slides off and the web view goes back (Next's own
/// history: the site's page changes are history entries), and the picture underneath stays until the page has had a
/// moment to draw, then fades. Let go before that: it slides back and nothing changes.
///
/// On a tab's own page (Open Invite, Events, Concierge, Discounts, Access: the tab bar's links), the swipe goes to the
/// tab on its left instead of back (Albert, 9 Nov 2026: "it should go to the page to the left, e.g. events to open
/// invite, conciege to events, disocunts to conciege etc. Open invite to nowhere"), through that tab's own link, so
/// it opens as a tap on the tab does. On the first tab it does not start. Every other page goes back, to the page
/// shown underneath.
///
/// It does not start where the page needs sideways touches itself, decided in the page as each touch starts (the
/// script below tells the app): a row that scrolls sideways (the filter chips), anything that handles its own drags
/// (touch-action none or pan-y: the photo cropper and its zoom slider), a range slider, anything marked
/// data-swipe-back="off", or while a sheet or dialog is open. Not with two fingers, not when there is nothing to go
/// back to. The page's own scrolling waits for it to decide, a moment, so a sideways swipe never scrolls as well.
/// Swiping forward is gone with WKWebView's gesture (Instagram has none).
final class SwipeBack: NSObject, UIGestureRecognizerDelegate, WKScriptMessageHandler {
    private static let messageName = "yuppieSwipeBack"
    private static let yellow = UIColor(red: 1.0, green: 0.8509803921568627, blue: 0.01568627450980392, alpha: 1.0)
    /// The pictures kept of earlier pages (the newest few), smaller than the screen to save memory.
    private static let keep = 6

    private weak var webView: WKWebView?
    private let isPaused: () -> Bool
    private let pan = UIPanGestureRecognizer()
    private var shots: [(item: WKBackForwardListItem, image: UIImage)] = []
    private var touchBlocked = false
    /// From the page, on each touch start: it is a tab's own page, and the tab on its left (nil: the first tab).
    private var touchOnTab = false
    private var touchLeftTab: String?
    /// Pictures by address too, for the tab pages (a tab swipe goes to a page by its address, not its history entry).
    private var pathShots: [(path: String, image: UIImage)] = []
    private var urlWatch: NSKeyValueObservation?
    private var scrollWatch: NSKeyValueObservation?
    private var pendingShot: DispatchWorkItem?
    // While a swipe is on screen: the cover over the web view, the page moving with the finger, the one underneath.
    private var cover: UIView?
    private var moving: UIView?
    private var under: UIView?
    private var shade: UIView?
    private var settling = false
    private var settleGeneration = 0
    /// The page the swipe shows underneath: a history entry to go back to exactly (see complete), or a tab's address.
    private var target: WKBackForwardListItem?
    private var targetTab: String?
    /// No picture of the page underneath (a tab or page not seen since the app opened): the swipe goes there as it
    /// starts and shows the real page underneath, not plain yellow (Albert, 9 Nov 2026); `liveFrom` is the page to
    /// come back to if the swipe is let go early.
    private var live = false
    private var liveFrom: WKBackForwardListItem?

    init(webView: WKWebView, isPaused: @escaping () -> Bool) {
        self.webView = webView
        self.isPaused = isPaused
        super.init()
        webView.allowsBackForwardNavigationGestures = false
        pan.addTarget(self, action: #selector(handlePan(_:)))
        pan.delegate = self
        pan.maximumNumberOfTouches = 1
        webView.addGestureRecognizer(pan)

        let controller = webView.configuration.userContentController
        controller.add(WeakScriptMessageHandler(self), name: Self.messageName)
        controller.addUserScript(WKUserScript(source: Self.touchScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        urlWatch = webView.observe(\.url, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.pageChanged() }
        }
        scrollWatch = webView.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.scheduleShot(after: 0.6) }
        }
        scheduleShot(after: 1.5)
    }

    // MARK: the page says whether this touch may start a swipe

    /// Runs in every page (main frame). On each touch start: blocked or not, as described above.
    private static let touchScript = """
        (function () {
          if (window.__yuppieSwipeBack) return;
          window.__yuppieSwipeBack = true;
          function shown(selector) {
            var list = document.querySelectorAll(selector);
            for (var i = 0; i < list.length; i++) if (list[i].getClientRects().length) return true;
            return false;
          }
          function blocked(target) {
            if (shown('dialog[open], [aria-modal="true"]')) return true;
            for (var el = target; el && el.nodeType === 1 && el !== document.body && el !== document.documentElement; el = el.parentElement) {
              if (el.matches('input[type="range"], [data-swipe-back="off"]')) return true;
              var style = getComputedStyle(el);
              var touch = style.touchAction || '';
              if (touch === 'none' || (touch.indexOf('pan-y') >= 0 && touch.indexOf('pan-x') < 0)) return true;
              if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
            }
            return false;
          }
          // A tab's own page: the tab bar's links, in order; the one on its left, or null for the first.
          function tabs() {
            var links = document.querySelectorAll('.mk-tabbar a.mk-tab[href]');
            var path = location.pathname.replace(/[/]+$/, '');
            for (var i = 0; i < links.length; i++) {
              if (links[i].getAttribute('href') === path) return { tab: true, left: i > 0 ? links[i - 1].getAttribute('href') : null };
            }
            return { tab: false, left: null };
          }
          document.addEventListener('touchstart', function (event) {
            try {
              var where = tabs();
              window.webkit.messageHandlers.yuppieSwipeBack.postMessage({
                no: event.touches.length !== 1 || blocked(event.target), tab: where.tab, left: where.left
              });
            } catch (e) {}
          }, { capture: true, passive: true });
        })();
        """

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName, let body = message.body as? [String: Any] else { return }
        touchBlocked = (body["no"] as? Bool) ?? false
        touchOnTab = (body["tab"] as? Bool) ?? false
        touchLeftTab = body["left"] as? String
    }

    // MARK: the gesture

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === pan, let webView, cover == nil, !touchBlocked, !isPaused() else { return false }
        // A tab's page goes to the tab on its left (none on the first tab); any other page goes back.
        if touchOnTab ? (touchLeftTab == nil) : !webView.canGoBack { return false }
        let velocity = pan.velocity(in: webView)
        return velocity.x > 0 && velocity.x > abs(velocity.y) * 1.3
    }

    /// The page's scrolling waits for this one to decide (it decides on the first movement), so a sideways swipe
    /// never scrolls the page as well.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === pan, let webView else { return false }
        return otherGestureRecognizer === webView.scrollView.panGestureRecognizer
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let webView else { return }
        let width = max(webView.bounds.width, 1)
        let progress = min(max(0, gesture.translation(in: webView).x), width) / width
        switch gesture.state {
        case .began:
            start(on: webView)
            follow(progress)
        case .changed:
            follow(progress)
        case .ended:
            let speed = gesture.velocity(in: webView).x
            if (progress > 0.33 && speed > -300) || speed > 800 {
                complete(from: progress, speed: speed)
            } else {
                cancel(from: progress)
            }
        case .cancelled, .failed:
            cancel(from: progress)
        default:
            break
        }
    }

    private func start(on webView: WKWebView) {
        let bounds = webView.bounds
        let cover = UIView(frame: bounds)
        cover.backgroundColor = Self.yellow
        cover.layer.zPosition = 1000

        let picture = UIImageView(frame: bounds)
        picture.contentMode = .scaleAspectFill
        picture.clipsToBounds = true
        picture.backgroundColor = Self.yellow
        if touchOnTab, let left = touchLeftTab {
            targetTab = left
            target = nil
            picture.image = pathShots.last(where: { $0.path == left })?.image
        } else {
            let back = webView.backForwardList.backItem
            target = back
            targetTab = nil
            picture.image = back.flatMap { shot(for: $0) }
        }

        let shade = UIView(frame: bounds)
        shade.backgroundColor = UIColor(white: 0, alpha: 0.16)

        let current = webView.backForwardList.currentItem
        live = picture.image == nil
        if live {
            // The real page underneath: the web view shows through the cover, and goes there now, hidden behind the
            // picture of this page that moves with the finger.
            cover.backgroundColor = .clear
            picture.isHidden = true
            liveFrom = current
        }
        let moving: UIView = webView.snapshotView(afterScreenUpdates: false)
            ?? UIImageView(image: current.flatMap { shot(for: $0) })
        moving.frame = bounds
        moving.backgroundColor = Self.yellow
        moving.layer.shadowColor = UIColor.black.cgColor
        moving.layer.shadowOpacity = 0.22
        moving.layer.shadowRadius = 10
        moving.layer.shadowOffset = CGSize(width: -3, height: 0)
        moving.layer.shadowPath = UIBezierPath(rect: bounds).cgPath

        cover.addSubview(picture)
        cover.addSubview(shade)
        cover.addSubview(moving)
        webView.addSubview(cover)
        self.cover = cover
        self.under = picture
        self.shade = shade
        self.moving = moving
        if live { goToTarget(on: webView) }
    }

    /// To the page underneath: the tab on the left through its own link, or the history entry shown underneath.
    private func goToTarget(on webView: WKWebView) {
        // By its history entry, not goBack(): WebKit's goBack() skips entries the page added without a tap of its
        // own, which is every page change in the site (Next adds them a moment after the tap), so it went all the
        // way back to the first page, Open Invite (Albert, 9 Nov 2026).
        if let tab = targetTab {
            // The tab's own link, as a tap on it (the site's page change, the tab fetched ahead); its address if the
            // link is not there.
            let href = (try? JSONEncoder().encode(tab)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"/members\""
            webView.evaluateJavaScript("""
                (function (href) {
                  var link = document.querySelector('.mk-tabbar a.mk-tab[href="' + href + '"]');
                  if (link) link.click(); else location.assign(href);
                })(\(href))
                """)
        } else if let target, webView.backForwardList.backList.contains(where: { $0 === target }) {
            _ = webView.go(to: target)
        } else {
            _ = webView.goBack()
        }
        target = nil
        targetTab = nil
    }

    private func follow(_ progress: CGFloat) {
        guard let cover, let moving, let under, let shade else { return }
        let width = cover.bounds.width
        moving.transform = CGAffineTransform(translationX: progress * width, y: 0)
        under.transform = CGAffineTransform(translationX: -0.3 * width * (1 - progress), y: 0)
        shade.alpha = 1 - progress
    }

    private func complete(from progress: CGFloat, speed: CGFloat) {
        guard let webView, cover != nil else { return }
        let width = max(webView.bounds.width, 1)
        let left = (1 - progress) * width
        let duration = max(0.12, min(0.3, Double(left / max(speed, 900))))
        if live {
            // Already there: the picture of the old page slides off the real one.
            UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut, .allowUserInteraction], animations: {
                self.follow(1)
            }, completion: { _ in
                self.removeCover()
            })
            return
        }
        UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut, .allowUserInteraction], animations: {
            self.follow(1)
        }, completion: { _ in
            self.moving?.removeFromSuperview()
            self.shade?.removeFromSuperview()
            self.moving = nil
            self.shade = nil
            self.settling = true
            self.settleGeneration += 1
            let generation = self.settleGeneration
            self.goToTarget(on: webView)
            // If the page change never shows up (it always should), uncover anyway.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self, self.settling, generation == self.settleGeneration else { return }
                self.uncover()
            }
        })
    }

    private func cancel(from progress: CGFloat) {
        guard cover != nil else { return }
        UIView.animate(withDuration: max(0.12, Double(progress) * 0.3), delay: 0, options: [.curveEaseOut], animations: {
            self.follow(0)
        }, completion: { _ in
            // A live swipe already went to the other page: back to this one, under its picture, then uncover.
            guard self.live, let webView = self.webView, let from = self.liveFrom else {
                self.removeCover()
                return
            }
            let list = webView.backForwardList
            guard list.currentItem !== from, (list.backList + list.forwardList).contains(where: { $0 === from }) else {
                self.removeCover()
                return
            }
            self.settling = true
            self.settleGeneration += 1
            let generation = self.settleGeneration
            _ = webView.go(to: from)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self, self.settling, generation == self.settleGeneration else { return }
                self.uncover()
            }
        })
    }

    /// The previous page is back in the web view: give it a moment to draw, then fade the picture away.
    private func pageChanged() {
        if settling {
            let generation = settleGeneration
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                guard let self, self.settling, generation == self.settleGeneration else { return }
                self.uncover()
            }
        }
        scheduleShot(after: 0.7)
    }

    private func uncover() {
        settling = false
        guard let cover else { return }
        UIView.animate(withDuration: 0.15, animations: {
            cover.alpha = 0
        }, completion: { _ in
            self.removeCover()
        })
    }

    private func removeCover() {
        target = nil
        targetTab = nil
        live = false
        liveFrom = nil
        cover?.removeFromSuperview()
        cover = nil
        moving = nil
        under = nil
        shade = nil
        settling = false
        scheduleShot(after: 0.6)
    }

    // MARK: pictures of the pages

    /// A picture of the page on screen, a moment after it changes or stops scrolling, kept for its history entry.
    private func scheduleShot(after delay: TimeInterval) {
        pendingShot?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.takeShot() }
        pendingShot = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    /// The picture of a history entry: the same entry, else the newest of the same address.
    private func shot(for item: WKBackForwardListItem) -> UIImage? {
        shots.last(where: { $0.item === item })?.image ?? shots.last(where: { $0.item.url == item.url })?.image
    }

    private func takeShot() {
        // Not under the opening screen: the first page is pictured once it is showing.
        if isPaused() {
            scheduleShot(after: 1)
            return
        }
        guard let webView, cover == nil, webView.window != nil, let item = webView.backForwardList.currentItem else { return }
        let configuration = WKSnapshotConfiguration()
        configuration.afterScreenUpdates = false
        webView.takeSnapshot(with: configuration) { [weak self] image, _ in
            guard let image else { return }
            DispatchQueue.global(qos: .utility).async {
                let small = SwipeBack.shrink(image)
                DispatchQueue.main.async {
                    guard let self, let webView = self.webView, webView.backForwardList.currentItem === item else { return }
                    self.shots.removeAll { $0.item === item }
                    self.shots.append((item: item, image: small))
                    if self.shots.count > SwipeBack.keep { self.shots.removeFirst(self.shots.count - SwipeBack.keep) }
                    let path = SwipeBack.path(of: item.url)
                    self.pathShots.removeAll { $0.path == path }
                    self.pathShots.append((path: path, image: small))
                    if self.pathShots.count > SwipeBack.keep { self.pathShots.removeFirst(self.pathShots.count - SwipeBack.keep) }
                }
            }
        }
    }

    /// "/members/events", as the tab bar's links write it (no trailing slash).
    private static func path(of url: URL) -> String {
        var path = url.path
        while path.count > 1 && path.hasSuffix("/") { path.removeLast() }
        return path
    }

    /// At most 1.5 pixels a point: the picture is only seen shaded, moving and for a moment.
    private static func shrink(_ image: UIImage) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = min(image.scale, 1.5)
        return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}

/// WKUserContentController keeps its message handlers strongly: this keeps SwipeBack weakly, so nothing leaks.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
