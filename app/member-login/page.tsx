import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getMember } from "@/app/members/require-member";
import {
  isNativeAppUserAgent,
  NATIVE_APP_COOKIE_NAME,
} from "@/lib/native-app";
import { noticeFrom } from "./login-errors";
import { MemberLoginForm } from "./member-login-form";
import { MemberLoginFormNative } from "./member-login-form-native";

export default async function MemberLoginPage({
  searchParams,
}: {
  // B-D1: Log out sends people here with ?state=logged-out, an expired session with ?state=session-ended.
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const [member, query] = await Promise.all([getMember(), searchParams]);
  const notice = noticeFrom(query.state);

  if (member) {
    redirect("/members");
  }

  // The app and the website each have their own sign-in form, edited
  // independently. Decided here on the server so the first paint is
  // already the right one: no hydration flash. The User-Agent marker is
  // checked first because it's on every native request from the very
  // first one, while the is-native-app cookie proxy.ts sets only reaches
  // this request via Next's proxy-cookie merge, and is otherwise absent
  // until request #2 on a fresh install.
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const isNativeApp =
    isNativeAppUserAgent(headerStore.get("user-agent") ?? "") ||
    cookieStore.get(NATIVE_APP_COOKIE_NAME)?.value === "1";

  return isNativeApp ? <MemberLoginFormNative notice={notice} /> : <MemberLoginForm notice={notice} />;
}
