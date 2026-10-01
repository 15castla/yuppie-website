import Foundation
import WebKit
import SafariServices
import Capacitor

// Capacitor's own built-in navigation handling (WebViewDelegationHandler,
// in the @capacitor/ios pod) already keeps server.url's own host and
// anything in capacitor.config.ts's server.allowNavigation (Stripe,
// Supabase — see the comment there) inside the main WebView, and for
// everything else it falls back to UIApplication.shared.open, which
// switches away to the full Safari app. That default fallback is what
// this file replaces: shouldOverrideLoad is a supported extension point
// every registered plugin gets a chance at (see CAPPlugin.h /
// WebViewDelegationHandler.swift's decidePolicyFor), called BEFORE
// Capacitor's own allowNavigation/app-origin checks. Returning nil here
// for anything in-app defers straight back to that existing, correct
// logic instead of duplicating it — this only needs to make its own call
// for genuinely external links, opening them in-app via
// SFSafariViewController instead of bouncing the member out to a
// separate app. This presents the same in-app sheet @capacitor/browser's
// own "open" call does (its native implementation is this exact class,
// see node_modules/@capacitor/browser/ios/.../Browser.swift) — used
// directly here rather than importing that plugin's Swift module, since
// there's no web JS context on the app's own pages to call
// Browser.open() from in the first place (the WebView loads
// clubyuppie.com directly; this plugin exists purely to react to native
// navigation events).
@objc(ExternalLinkPlugin)
public class ExternalLinkPlugin: CAPPlugin, CAPBridgedPlugin, SFSafariViewControllerDelegate {
    public let identifier = "ExternalLinkPlugin"
    public let jsName = "ExternalLinkPlugin"
    public let pluginMethods: [CAPPluginMethod] = []

    private var safariViewController: SFSafariViewController?

    @objc func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            // Non-http(s) schemes (mailto:, tel:, etc.) and anything with
            // no URL at all: no opinion, let Capacitor/the system handle
            // it as normal.
            return nil
        }

        guard navigationAction.targetFrame?.isMainFrame ?? true else {
            // Only ever intervene on top-level navigations. An iframe
            // (e.g. a Stripe 3D Secure challenge rendered inside the
            // page) navigating internally isn't something a member is
            // "going" anywhere for.
            return nil
        }

        if isInAppHost(url.host) {
            return nil
        }

        openExternally(url)
        return true
    }

    private func isInAppHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }

        if let serverHost = bridge?.config.serverURL.host?.lowercased(), host == serverHost {
            return true
        }
        // Mirrors capacitor.config.ts's server.allowNavigation list.
        let allowedSuffixes = ["clubyuppie.com", "stripe.com", "supabase.co"]
        return allowedSuffixes.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    private func openExternally(_ url: URL) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let safariVC = SFSafariViewController(url: url)
            safariVC.delegate = self
            self.safariViewController = safariVC
            self.bridge?.viewController?.present(safariVC, animated: true)
        }
    }

    public func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        safariViewController = nil
    }
}
