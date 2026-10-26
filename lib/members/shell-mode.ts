// Which shell a request gets: "app" inside the Club Yuppie app, "web" in a
// browser. The app's WebView stamps its User-Agent with YuppieNativeApp, which
// is reliable from the first request, and proxy.ts mirrors it into the
// is-native-app cookie on every response (see lib/native-app.ts for why both).
// Server only: it reads the request.

import { cookies, headers } from "next/headers";

import { isNativeAppCookie, isNativeAppUserAgent } from "@/lib/native-app";
import type { ShellMode } from "@/components/members/shell/types";

export async function detectShellMode(): Promise<ShellMode> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  if (isNativeAppUserAgent(headerList.get("user-agent") ?? "")) return "app";
  if (isNativeAppCookie(cookieStore.toString())) return "app";
  return "web";
}
