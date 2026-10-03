import Foundation
import WebKit
import SafariServices
import Capacitor

// shouldOverrideLoad is a supported extension point every registered
// plugin gets a chance at (see CAPPlugin.h / WebViewDelegationHandler.swift's
// decidePolicyFor), called BEFORE Capacitor's own allowNavigation/app-origin
// checks. This plugin is authoritative (returns true or false, never nil)
// for every top-level http(s) navigation: true opens genuinely external
// links in-app via SFSafariViewController instead of bouncing the member
// out to a separate app (the same in-app sheet @capacitor/browser's own
// "open" call does — its native implementation is this exact class, see
// node_modules/@capacitor/browser/ios/.../Browser.swift — used directly
// here rather than importing that plugin's Swift module, since there's no
// web JS context on the app's own pages to call Browser.open() from in the
// first place); false allows known in-app hosts immediately.
//
// It deliberately does NOT return nil (defer) for in-app hosts, even
// though that would normally fall through to Capacitor's own built-in
// containment check in WebViewDelegationHandler.swift. That built-in check
// is `navURL.absoluteString.starts(with: bridge.config.serverURL.absoluteString)`
// — a *path* prefix match against the exact configured server.url, not
// just a host match. Since server.url is
// "https://clubyuppie.com/member-login" (a sub-path, not the bare origin
// — see capacitor.config.ts), any in-app navigation whose path doesn't
// literally start with "/member-login" fails that check and gets bounced
// out via UIApplication.shared.open — both the offline-recovery retry
// (www-placeholder/offline.html navigating back to SITE_URL) and, more
// broadly, ordinary post-login navigation from /member-login to
// /members/*. Deciding authoritatively here instead keeps our own
// host-based allowlist (which correctly treats all of clubyuppie.com as
// in-app regardless of path) in control instead of relying on that
// path-prefix assumption.
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
            // false, not nil — see the class-level comment above for why
            // this must decide outright rather than defer to Capacitor's
            // own (path-prefix-based) containment check.
            return false
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
