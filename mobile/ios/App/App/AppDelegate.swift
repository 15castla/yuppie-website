import UIKit
import Capacitor
import os

// TEMPORARY — investigating a reported 2-3 minute black screen on cold
// launch before the splash (wordmark + comet ring) ever appears, with no
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
        // Override point for customization after application launch.
        return true
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
