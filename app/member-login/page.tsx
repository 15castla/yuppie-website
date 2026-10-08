import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getMember } from "@/app/members/require-member";
import {
  isNativeAppUserAgent,
  NATIVE_APP_COOKIE_NAME,
} from "@/lib/native-app";
import { MemberLoginForm } from "./member-login-form";

export default async function MemberLoginPage() {
  const member = await getMember();

  if (member) {
    redirect("/members");
  }

  // Decided here on the server so the first paint already has the right
  // eyebrow label and logo: no hydration flash. The User-Agent marker is
  // checked first because it's on every native request from the very
  // first one, while the is-native-app cookie proxy.ts sets only reaches
  // this request via Next's proxy-cookie merge, and is otherwise absent
  // until request #2 on a fresh install.
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const isNativeApp =
    isNativeAppUserAgent(headerStore.get("user-agent") ?? "") ||
    cookieStore.get(NATIVE_APP_COOKIE_NAME)?.value === "1";

  return <MemberLoginForm isNativeApp={isNativeApp} />;
}
