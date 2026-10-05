import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var cometRingView: CometSpinnerView?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeVC = CAPBridgeViewController()
        window?.rootViewController = bridgeVC
        window?.makeKeyAndVisible()

        registerExternalLinkPlugin(on: bridgeVC)
        addCometRing(to: bridgeVC)

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
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
        guard let bridge = bridgeVC.bridge else {
            CAPLog.print("⚡️ ❌ ExternalLinkPlugin not registered: bridge was nil")
            return
        }
        bridge.registerPluginInstance(ExternalLinkPlugin())
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
    // So it's added here in code instead, timed to match Capacitor's own
    // splash window. An explicit high zPosition keeps it stacked above
    // whatever Capacitor adds afterward regardless of the exact timing of
    // its plugin-load lifecycle relative to this method.
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

        // Matches capacitor.config.ts's SplashScreen plugin config:
        // launchShowDuration (3000ms) + launchFadeOutDuration (300ms).
        let showDuration: TimeInterval = 3.0
        let fadeOutDuration: TimeInterval = 0.3
        DispatchQueue.main.asyncAfter(deadline: .now() + showDuration) { [weak ring] in
            guard let ring = ring else { return }
            UIView.animate(withDuration: fadeOutDuration, delay: 0, options: .curveLinear, animations: {
                ring.alpha = 0
            }, completion: { _ in
                ring.removeFromSuperview()
            })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
