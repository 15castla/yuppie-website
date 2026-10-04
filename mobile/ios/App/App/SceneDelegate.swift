import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeVC = CAPBridgeViewController()
        window?.rootViewController = bridgeVC
        window?.makeKeyAndVisible()

        registerExternalLinkPlugin(on: bridgeVC)

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

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
