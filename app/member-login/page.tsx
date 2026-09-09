import { redirect } from "next/navigation";

import { getMember } from "@/app/members/require-member";
import { MemberLoginForm } from "./member-login-form";

export default async function MemberLoginPage() {
  const member = await getMember();

  if (member) {
    redirect("/members");
  }

  return <MemberLoginForm />;
}
