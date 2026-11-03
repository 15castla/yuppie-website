import { returnPath } from "@/lib/members/photo/return-path";
import { flags } from "@/lib/members/flags";
import { landingPath } from "@/lib/members/routes";
import { detectShellMode } from "@/lib/members/shell-mode";
import { RulesGateView } from "@/components/members/rules/rules-view";
import { GateDeleteAccount } from "@/components/members/gates/gate-delete";
import { signOutMember } from "../profile/actions";
import { requireMember } from "../require-member";
import { agreeToRules } from "./actions";
import { redirect } from "next/navigation";

// The rules gate (3 Nov 2026, Apple guideline 1.2): every member agrees to the community rules once, before using the
// members area. requireMember sends anyone who has not agreed here (after the membership and photo gates), with the
// page they were going to as ?next=. Someone who has agreed already goes straight on.
export default async function MembersRulesGatePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [member, mode, query] = await Promise.all([requireMember({ allowNoRules: true }), detectShellMode(), searchParams]);
  const next = returnPath(typeof query.next === "string" ? query.next : null);
  if (member.rules_agreed_at) redirect(next ?? landingPath(flags, mode));
  return <RulesGateView mode={mode} agree={agreeToRules.bind(null, next)} signOut={signOutMember} deleteAccount={<GateDeleteAccount />} />;
}
