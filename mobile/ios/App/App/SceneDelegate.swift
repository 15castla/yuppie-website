import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var cometRingView: CometSpinnerView?
    private var splashImageView: UIImageView?
    // Retaining this token is required or observation stops immediately.
    // See hideSplashWhenWebViewReady(on:) for what it does.
    private var webViewLoadingObservation: NSKeyValueObservation?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        startupLog("SceneDelegate.scene(_:willConnectTo:) entered")
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // The gap between here and addCometRing() below (bridge/WebView
        // creation via makeKeyAndVisible(), which has been measured
        // taking anywhere from ~1s to several seconds on a cold
        // Simulator boot, and is not bounded by anything in this file)
        // has no splash overlay in it yet — Capacitor's own SplashScreen
        // view and our CometSpinnerView are both added later in this
        // method. Without an explicit background, that gap renders
        // whatever UIWindow's default is (black), which is exactly the
        // "black screen, then the yellow spinner appears" symptom from
        // the cold-launch investigation: not the splash/comet-ring
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
        fixSafeAreaInsetFirstFrame(on: bridgeVC)
        hideSplashWhenWebViewReady(on: bridgeVC)
        registerExternalLinkPlugin(on: bridgeVC)
        addSplashImage(to: bridgeVC)
        addCometRing(to: bridgeVC)

        startupLog("scene(_:willConnectTo:) about to call SceneDelegateProxy")
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        startupLog("scene(_:willConnectTo:) returning")
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
    // appending a <style> tag that hard-sets <main>'s padding-top with
    // !important — the exact same max(2rem, inset) the page's own CSS
    // wants, just computed here instead of trusting env() to deliver it.
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
    // The injected value also isn't the raw hardware safe area on its
    // own: measured twice, consistently, the website in Safari shows
    // ~92-93pt of clearance on this device while window.safeAreaInsets.top
    // alone (62pt) produces ~60pt in the app — a stable ~30pt short.
    // That's structural, not error: Safari reserves extra space of its
    // own above the page for its retractable tab-bar/toolbar chrome,
    // which collapses but still factors into what Safari considers
    // "safe," on top of the real hardware inset; this WebView has no
    // such chrome at all, so its hardware-accurate safe area reading was
    // always going to be smaller than Safari's by roughly that chrome's
    // height. The goal here is pixel parity with the live website people
    // already see in Safari, not textbook safe-area correctness for its
    // own sake — so this adds that gap back in explicitly as a fixed
    // buffer on top of the real per-device safe-area reading (not a
    // single hardcoded constant on its own), so it still scales sensibly
    // across other notch/Dynamic Island sizes. Confirmed via real-device
    // pixel measurement to land within ~2pt of the website — noise-level.
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
            // The stable gap measured between Safari's rendered spacing
            // and this WebView's hardware-accurate safe area — see the
            // comment above for why that gap exists structurally rather
            // than being an error to fix away.
            let safariChromeBuffer: CGFloat = 30
            let targetInset = windowInset + safariChromeBuffer
            let insetPx = Int(targetInset.rounded())
            startupLog("fixSafeAreaInsetFirstFrame: adjustedContentInset.top = \(topInset) after \(attempt) poll(s); window.safeAreaInsets.top = \(windowInset) + \(safariChromeBuffer)pt buffer = \(targetInset); injecting override stylesheet (padding-top: max(2rem, \(insetPx)px))")

            // Removes any native contentOffset contribution .automatic
            // might otherwise apply on its own (see the comment above) —
            // all visible top clearance should come from the CSS
            // injection below alone.
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            webView.scrollView.contentOffset = .zero

            let css = "main { padding-top: max(2rem, \(insetPx)px) !important; }"
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
    // launchShowDuration: 3000 hides the native splash (and, independently,
    // addCometRing below used to fade out the comet ring) on a flat 3s
    // timer — regardless of whether the page has actually finished
    // loading. On a fast connection that's a few seconds of looking at
    // the splash after content is already ready for no reason; on a slow
    // one, exactly the scenario Capacitor's own SplashScreen.swift source
    // warns about in its hideSplash log message — the splash disappears
    // out from under a still-loading page, dropping straight to a bare
    // yellow background (the WebView's own backgroundColor) until the
    // page finally paints. This replaces the timer with the real signal:
    // hide once the WebView has actually finished loading, however long
    // that takes.
    //
    // Deliberately does NOT touch capacitor.config.ts's launchAutoHide/
    // launchShowDuration to do this — that config is shared with Android,
    // whose own splash mechanism (see MainActivity.java's showCometRing)
    // is a completely different implementation that also reads
    // launchAutoHide to decide whether to ever unblock its content view
    // at all; flipping it off globally would leave Android's content
    // permanently hidden unless its native code were also changed to
    // match, which isn't verifiable in this environment (no Android
    // SDK). Instead this calls SplashScreen.hide() explicitly, early,
    // via the same public JS API a Capacitor-aware website would call
    // itself — confirmed safe by reading SplashScreen.swift directly:
    // hideSplash() checks `if !isVisible { return }` before doing
    // anything, so the original timer (which can't be cancelled — it's
    // a bare asyncAfter closure, not a cancellable DispatchWorkItem) is
    // reduced to a harmless no-op once this has already fired, with no
    // spurious "automatically hidden after default timeout" log either
    // (that warning is also gated on isVisible, which hide() has by
    // then already set to false).
    //
    // isLoading flipping to false means the network load for the initial
    // HTML/JS finished, not that real content is on screen — this app's
    // Next.js App Router routes (app/members/loading.tsx,
    // app/members/events/[slug]/loading.tsx) each mount their own <main>
    // containing nothing but a small route-level loading spinner
    // (h-8 w-8 animate-spin...) via a Suspense fallback, while the real
    // page's server component (requireMember() + data fetching) is still
    // resolving — confirmed directly by reading those files. A first
    // version of this check only waited for document.querySelector('main')
    // to exist, which that loading skeleton's own <main> satisfies
    // immediately: in testing, that hid the splash the instant the
    // skeleton mounted, revealing its small spinner alongside (then
    // alone after) the comet ring's fade-out — the "second, smaller
    // spinning circle" symptom. Waiting for <main> to exist AND for no
    // [class*="animate-spin"] element to be present anywhere in the
    // document (not scoped to <main> — confirmed via grep that no other
    // part of the members shell, e.g. MembersNav/MembersBottomBar, uses
    // this marker outside of an explicit user-initiated action like
    // RedeemCard's own redeem-in-progress spinner, which can't be
    // mounted yet this early) is a route-agnostic proxy for "the
    // Suspense boundary has resolved to real content," without hardcoding
    // selectors specific to any one page — same reasoning as
    // checkLiveSafeAreaCSS used during the safe-area investigation.
    //
    // Capped at 8s (80 polls) rather than the original 2s: this is
    // waiting on a real server round-trip (requireMember() plus parallel
    // Supabase queries on app/members/page.tsx, for example), not just
    // DOM/JS readiness, so it needs meaningfully more headroom. If that
    // never resolves, it hides anyway once the cap is hit — at that
    // point the route's own loading.tsx spinner is a more honest state
    // to show the user than our branded splash stuck on screen
    // indefinitely.
    private func hideSplashWhenWebViewReady(on bridgeVC: CAPBridgeViewController) {
        guard let webView = bridgeVC.webView else { return }
        webViewLoadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self, weak webView] _, change in
            guard change.newValue == false, let self, let webView else { return }
            // Only needs to happen once.
            self.webViewLoadingObservation = nil
            startupLog("hideSplashWhenWebViewReady: webView finished loading, waiting for real content before hiding")
            self.waitForContentThenHideSplash(on: webView)
        }
    }

    private func waitForContentThenHideSplash(on webView: WKWebView, attempt: Int = 0) {
        let js = "document.querySelector('main') != null && document.querySelector('[class*=\"animate-spin\"]') == null"
        webView.evaluateJavaScript(js) { [weak self, weak webView] result, _ in
            guard let self, let webView else { return }
            let ready = (result as? Bool) ?? false
            if !ready, attempt < 80 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.waitForContentThenHideSplash(on: webView, attempt: attempt + 1)
                }
                return
            }
            startupLog("waitForContentThenHideSplash: ready=\(ready) after \(attempt) poll(s), hiding splash + comet ring")
            self.hideSplashAndCometRing(on: webView)
        }
    }

    private func hideSplashAndCometRing(on webView: WKWebView) {
        webView.evaluateJavaScript("window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen && window.Capacitor.Plugins.SplashScreen.hide()")

        let viewsToFade = [cometRingView, splashImageView].compactMap { $0 }
        cometRingView = nil
        splashImageView = nil
        guard !viewsToFade.isEmpty else { return }
        // Matches capacitor.config.ts's SplashScreen.launchFadeOutDuration
        // (300ms), so the native splash, our own splash image, and the
        // comet ring all fade out together.
        UIView.animate(withDuration: 0.3, delay: 0, options: .curveLinear, animations: {
            viewsToFade.forEach { $0.alpha = 0 }
        }, completion: { _ in
            viewsToFade.forEach { $0.removeFromSuperview() }
        })
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
    // background + wordmark image) is auto-hidden by a flat
    // capacitor.config.ts launchShowDuration (3000ms) timer that can't be
    // cancelled (see hideSplashWhenWebViewReady's comment — confirmed via
    // SplashScreen.swift's source) and isn't safe to change globally
    // either, since it's shared with Android, whose splash mechanism has
    // no equivalent of this app's own early-hide logic and would simply
    // show its splash longer on every launch, fast or slow, if this were
    // increased. So on a page that takes longer than 3s to be ready —
    // routine in testing (6-20s, sometimes more, depending on network) —
    // Capacitor's own splash disappears on schedule regardless, dropping
    // straight to the WebView's own plain yellow background (no wordmark)
    // while the comet ring — now correctly tied to real readiness instead
    // of a timer — keeps spinning on top alone. Confirmed live: this is
    // exactly the "wordmark disappears, ring spins by itself" symptom.
    //
    // Rather than fight Capacitor's own splash timer, this duplicates its
    // visual content under our own control: a second, identical
    // full-screen rendering of the same Splash image, stacked above
    // whatever Capacitor's splash does and below the comet ring. When
    // Capacitor's own splash view fades out at the 3s mark, this duplicate
    // is already sitting on top showing the exact same thing, so nothing
    // visibly changes — then hideSplashAndCometRing fades this out
    // together with the ring once real content is actually ready,
    // matching the ring's own dismissal exactly instead of being at the
    // mercy of an uncancellable native timer.
    private func addSplashImage(to bridgeVC: CAPBridgeViewController) {
        guard let image = UIImage(named: "Splash") else { return }
        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.layer.zPosition = 500
        bridgeVC.view.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: bridgeVC.view.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: bridgeVC.view.bottomAnchor),
            imageView.leadingAnchor.constraint(equalTo: bridgeVC.view.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: bridgeVC.view.trailingAnchor)
        ])
        splashImageView = imageView
    }

    // Capacitor's SplashScreen plugin (see
    // mobile/node_modules/@capacitor/splash-screen's SplashScreenPlugin.swift)
    // adds its own views — the LaunchScreen storyboard's background image
    // and, if showSpinner were true, a system UIActivityIndicatorView — as
    // subviews of this same bridge view controller's .view. This adds the
    // bespoke comet ring the same way, replacing that generic spinner
    // (capacitor.config.ts sets showSpinner: false so Capacitor doesn't
    // also add its own on top).
    //
    // This can't live in the storyboard itself: a launch screen storyboard
    // can't host a custom-class view at all — ibtool rejects it outright
    // ("Launch screens may not set custom classnames"), a hard platform
    // restriction on the first native-only frame, not a bug in the XML.
    // So it's added here in code instead. An explicit high zPosition
    // keeps it stacked above whatever Capacitor adds afterward regardless
    // of the exact timing of its plugin-load lifecycle relative to this
    // method. Dismissal is handled by hideSplashAndCometRing above, once
    // the WebView actually has real content ready — not on a fixed timer.
    //
    // Sized and centered to frame the wordmark baked into the Splash
    // image (Assets.xcassets/Splash.imageset), not just float below it.
    // The wordmark isn't a live view here — it's part of a static
    // scaleAspectFill'd image — so its on-screen geometry is derived from
    // the same fractions .scratch/gen_all_splash.py generated it with
    // (wordmark_width_frac=0.227, vertical_center_frac=0.434 of the
    // 2732x2732 square canvas), confirmed against the actual shipped
    // asset by measuring its non-background bounding box. Because
    // scaleAspectFill on a square image scales both dimensions by
    // screenHeight/2732 — height fits the screen exactly, width overflows
    // and gets cropped evenly off both sides — those canvas fractions
    // translate directly to screen points as fractions of screen HEIGHT
    // alone, regardless of device aspect ratio or screen width:
    //   wordmark width (pt)        = 0.227 * screenHeight
    //   wordmark center, Y (pt)    = 0.434 * screenHeight
    //   wordmark center, X         = screen's horizontal center (it's
    //                                 centered in the canvas, and cropping
    //                                 trims both sides equally)
    private func addCometRing(to bridgeVC: CAPBridgeViewController) {
        startupLog("addCometRing: start")
        let ring = CometSpinnerView()
        ring.translatesAutoresizingMaskIntoConstraints = false
        ring.layer.zPosition = 999
        bridgeVC.view.addSubview(ring)

        let screenHeight = bridgeVC.view.bounds.height
        let wordmarkWidthFraction: CGFloat = 0.227
        let wordmarkVerticalCenterFraction: CGFloat = 0.434
        let wordmarkWidth = wordmarkWidthFraction * screenHeight
        // How much larger the ring's diameter is than the wordmark's
        // width — the wordmark's longer dimension — so the ring reads as
        // a loose circle framing it with visible breathing room on every
        // side, matching the reference (Reiss's app splash): the ring
        // isn't a tight circumscribe, it's a comfortably larger halo.
        let ringPaddingFactor: CGFloat = 1.4
        let ringDiameter = wordmarkWidth * ringPaddingFactor
        // view.centerYAnchor is screen-center (0.5); the wordmark sits
        // slightly above that, so the ring needs the same upward offset
        // to share its center point.
        let verticalOffsetFromCenter = (wordmarkVerticalCenterFraction - 0.5) * screenHeight

        NSLayoutConstraint.activate([
            ring.centerXAnchor.constraint(equalTo: bridgeVC.view.centerXAnchor),
            ring.centerYAnchor.constraint(equalTo: bridgeVC.view.centerYAnchor, constant: verticalOffsetFromCenter),
            ring.widthAnchor.constraint(equalToConstant: ringDiameter),
            ring.heightAnchor.constraint(equalTo: ring.widthAnchor)
        ])
        cometRingView = ring
        startupLog("addCometRing: done")
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
