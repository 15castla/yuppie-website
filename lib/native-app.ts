// Marker Capacitor's appendUserAgent stamps on every request the native
// iOS/Android app's WebView makes (see mobile/capacitor.config.ts). The
// single source of truth proxy.ts checks server-side (against the request's
// User-Agent header, which is reliably present from request #1) to tell
// native app traffic apart from ordinary browser visitors. Kept
// framework-agnostic (no "next/server" or React imports) so it's safe to
// import from either side.
export const NATIVE_APP_USER_AGENT_MARKER = "YuppieNativeApp";

export function isNativeAppUserAgent(userAgent: string): boolean {
  return userAgent.includes(NATIVE_APP_USER_AGENT_MARKER);
}

// proxy.ts sets this cookie (to "1") on every response where
// isNativeAppUserAgent() is true, so client code (see SiteNav) can read
// native-app-ness synchronously from document.cookie instead of checking
// navigator.userAgent client-side. That matters because
// WKWebViewConfiguration.applicationNameForUserAgent — what makes
// navigator.userAgent carry NATIVE_APP_USER_AGENT_MARKER in the first
// place — isn't reliably propagated by the time a freshly-created
// WKWebView's very first page hydrates, even though the same marker is
// already reliable in the request header at that same moment (confirmed:
// proxy.ts's own redirects work correctly on a cold launch). The cookie
// arrives with the same HTTP response as the document itself, so there's
// no WebView-configuration timing left to race against.
export const NATIVE_APP_COOKIE_NAME = "is-native-app";

export function isNativeAppCookie(cookieHeader: string): boolean {
  return cookieHeader
    .split(";")
    .some((pair) => pair.trim() === `${NATIVE_APP_COOKIE_NAME}=1`);
}
