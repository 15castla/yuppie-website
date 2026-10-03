// Marker Capacitor's appendUserAgent stamps on every request the native
// iOS/Android app's WebView makes (see mobile/capacitor.config.ts). The
// single source of truth proxy.ts (server-side) and SiteNav (client-side)
// both check against to tell native app traffic apart from ordinary
// browser visitors. Kept framework-agnostic (no "next/server" or React
// imports) so it's safe to import from either side.
export const NATIVE_APP_USER_AGENT_MARKER = "YuppieNativeApp";

export function isNativeAppUserAgent(userAgent: string): boolean {
  return userAgent.includes(NATIVE_APP_USER_AGENT_MARKER);
}
