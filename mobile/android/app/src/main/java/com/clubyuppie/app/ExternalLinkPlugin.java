package com.clubyuppie.app;

import android.net.Uri;
import com.capacitorjs.plugins.browser.Browser;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Mirrors ios/App/App/ExternalLinkPlugin.swift — see the comment there for
 * the full reasoning. Capacitor's own built-in navigation handling
 * (Bridge.launchIntent) already keeps server.url's own host and anything
 * in capacitor.config.ts's server.allowNavigation (Stripe, Supabase)
 * inside the main WebView; for anything else it falls back to firing an
 * ACTION_VIEW Intent, which switches away to a separate browser app. This
 * plugin replaces just that fallback: shouldOverrideLoad is called on
 * every registered plugin before Bridge's own allowNavigation/app-origin
 * checks (see Bridge.java#launchIntent), so returning null for anything
 * in-app defers straight back to that existing, correct logic — this only
 * makes its own call for genuinely external links, opening them in-app
 * via capacitor-browser's own Chrome Custom Tabs implementation instead
 * of bouncing the member out to a separate app.
 */
@CapacitorPlugin(name = "ExternalLinkPlugin")
public class ExternalLinkPlugin extends Plugin {
    private Browser browser;

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String scheme = url.getScheme();
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) {
            // Non-http(s) schemes (mailto:, tel:, etc.): no opinion, let
            // Capacitor/the system handle it as normal.
            return null;
        }

        if (isInAppHost(url.getHost())) {
            return null;
        }

        openExternally(url);
        return true;
    }

    private boolean isInAppHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase();

        // getHost() returns server.hostname (Capacitor's *local* asset-serving
        // host, e.g. "localhost" — unrelated here), not the configured remote
        // server.url this app actually loads, so that has to be parsed out of
        // getServerUrl() directly instead.
        String configuredServerUrl = getBridge().getServerUrl();
        if (configuredServerUrl != null) {
            String serverHost = Uri.parse(configuredServerUrl).getHost();
            if (serverHost != null && host.equals(serverHost.toLowerCase())) {
                return true;
            }
        }
        // Mirrors capacitor.config.ts's server.allowNavigation list.
        String[] allowedSuffixes = { "clubyuppie.com", "stripe.com", "supabase.co" };
        for (String suffix : allowedSuffixes) {
            if (host.equals(suffix) || host.endsWith("." + suffix)) {
                return true;
            }
        }
        return false;
    }

    private void openExternally(Uri url) {
        if (browser == null) {
            browser = new Browser(getContext());
        }
        getActivity().runOnUiThread(() -> {
            browser.bindService();
            browser.open(url);
        });
    }
}
