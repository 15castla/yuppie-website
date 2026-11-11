import UIKit
import Capacitor
import UserNotifications
import WebKit
import os

// TEMPORARY — investigating a reported 2-3 minute black screen on cold
// launch before the splash (then wordmark + comet ring) ever appears, with no
// crash and no console output. appStartUptime is a shared reference point
// (ProcessInfo.systemUptime is monotonic, fine for elapsed-time deltas)
// so every startupLog(...) call across AppDelegate.swift and
// SceneDelegate.swift reports elapsed time on the same timeline, from as
// close to actual process start as Swift lets us get: a top-level `let`
// is evaluated the first time this file's code runs, which for a
// @UIApplicationMain app is effectively immediately. Logged via os.Logger
// (unified logging), not print() — print()'s stdout is block-buffered
// when not attached to a real terminal, which silently swallowed output
// during the Safari-bounce investigation earlier this session. Remove
// this together with its call sites once the black-screen cause is
// found and fixed (or confirmed environmental).
let appStartUptime = ProcessInfo.processInfo.systemUptime
let startupLogger = Logger(subsystem: "com.clubyuppie.app", category: "startup")

func startupLog(_ message: String) {
    let elapsed = ProcessInfo.processInfo.systemUptime - appStartUptime
    startupLogger.fault("⏱️ [+\(String(format: "%.3f", elapsed))s] \(message, privacy: .public)")
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        startupLog("AppDelegate.didFinishLaunchingWithOptions")
        // Phone notifications (PushBridge, below): set before launch ends, so a notification tapped to open the app
        // is not missed.
        UNUserNotificationCenter.current().delegate = PushBridge.shared
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushBridge.shared.registered(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        startupLog("push: registering for notifications failed: \(error.localizedDescription)")
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        startupLog("AppDelegate.configurationForConnecting")
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// Phone notifications (Albert, 11 Nov 2026: "move everything to app notifications"). The members pages ask through
/// window.webkit.messageHandlers.yuppiePush and hear back through "yuppie-push" events (the page's side is
/// lib/members/native-push.ts):
///
///   { action: "status" }        -> { type: "status", status: "granted" | "denied" | "not_asked" }, and when allowed,
///                                  registers for notifications -> { type: "token", token, environment }
///   { action: "ask" }           -> iOS's own "Allow notifications?" (once ever), then as "status"
///   { action: "openSettings" }  -> the app's page in Settings (after "Don't Allow", only Settings can turn them on)
///
/// A notification carries the members page it is about ("path"). Tapped, the app opens that page: at once when the
/// app is running, or once the first page is on screen when the tap opened the app (SceneDelegate.hideSplash calls
/// pageIsReady). With the app open, a notification about the page already on screen (the chat being read) is not
/// shown. Debug builds (run from Xcode) get sandbox device tokens, App Store and TestFlight builds production ones:
/// the server sends each to its own Apple host.
final class PushBridge: NSObject, UNUserNotificationCenterDelegate, WKScriptMessageHandler {
    static let shared = PushBridge()
    private static let messageName = "yuppiePush"
    #if DEBUG
    private static let environment = "sandbox"
    #else
    private static let environment = "production"
    #endif

    private weak var webView: WKWebView?
    private var pageReady = false
    private var pendingPath: String?

    func attach(to webView: WKWebView) {
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: Self.messageName)
        controller.add(PushMessageProxy(self), name: Self.messageName)
    }

    /// The first page is on screen: a notification tapped to open the app opens its page now.
    func pageIsReady() {
        pageReady = true
        if let path = pendingPath {
            pendingPath = nil
            open(path)
        }
    }

    // MARK: the page asks

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "status":
            reportStatus()
        case "ask":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] _, _ in
                DispatchQueue.main.async { self?.reportStatus() }
            }
        case "openSettings":
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        default:
            break
        }
    }

    /// What the phone says now; when notifications are allowed, ask iOS for this phone's token (it answers in
    /// AppDelegate, then registered(_:)), so the server always has the current one.
    private func reportStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { return }
                let status: String
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    status = "granted"
                case .denied:
                    status = "denied"
                default:
                    status = "not_asked"
                }
                self.tell(["type": "status", "status": status])
                if status == "granted" {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    func registered(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        tell(["type": "token", "token": hex, "environment": Self.environment])
    }

    private func tell(_ detail: [String: String]) {
        guard let webView,
              let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('yuppie-push', { detail: \(json) }));")
    }

    // MARK: notifications

    /// The app is open: show it, unless it is about the page already on screen.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let path = notification.request.content.userInfo["path"] as? String
        DispatchQueue.main.async { [weak self] in
            if let path, let current = self?.webView?.url?.path, Self.trimmed(path) == Self.trimmed(current) {
                completionHandler([])
            } else {
                completionHandler([.banner, .list, .sound])
            }
        }
    }

    /// Tapped: open its page.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let path = response.notification.request.content.userInfo["path"] as? String
        DispatchQueue.main.async { [weak self] in
            if let path { self?.open(path) }
            completionHandler()
        }
    }

    private func open(_ path: String) {
        // Only the members area's own pages.
        guard path.hasPrefix("/members"), !path.contains("//"), !path.contains("..") else { return }
        guard pageReady, let webView else {
            pendingPath = path
            // If the first page never says it is ready, go anyway after a while.
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                guard let self, self.pendingPath == path else { return }
                self.pageIsReady()
            }
            return
        }
        let literal = (try? JSONEncoder().encode(path)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"/members\""
        webView.evaluateJavaScript("window.__yuppiePushOpen ? window.__yuppiePushOpen(\(literal)) : window.location.assign(\(literal));")
    }

    private static func trimmed(_ path: String) -> String {
        var p = path
        while p.count > 1 && p.hasSuffix("/") { p.removeLast() }
        return p
    }
}

/// WKUserContentController keeps its message handlers strongly: this keeps PushBridge weakly.
private final class PushMessageProxy: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
