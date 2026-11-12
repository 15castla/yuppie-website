import "server-only";

// Nominations (Albert, 11 to 12 Nov 2026: "a member can refer an applicant. Each member will get 5 referrals ... if
// approved their account will be credited with £10"; "it's 5 nominations (doesn't matter if they get approved or
// not)"), server only.
//
//   - Each member has a code (ALBERT-7K2Q), made the first time they need it, and a link: /apply?n=<code>.
//   - An application made with the link or the code is "Nominated by" that member (applications.nominated_by) and
//     uses one of their nominations, whatever the committee decides. With none left, the code no longer works (the
//     person can still apply without it). Only a member whose membership is active can nominate.
//   - When the committee approves a nominee (their first month paid: app/admin/applications-actions.ts approve),
//     the nominator gets £10 of credit (lib/server/credit.ts) and a phone notification: "Ann is in".
//   - The nominator sees each nominee's first name: Applied, Approved (+£10), or Nomination used when they were not
//     accepted (they are never told that in so many words).

import { NOMINATION_CREDIT_PENCE, NOMINATIONS_DEFAULT, type NominateCardData, type NominatePageData, type NominationRow } from "@/lib/members/nominate/types";
import { ROUTES } from "@/lib/members/routes";
import { pushLiveFor, siteUrl } from "./config";
import { addCredit, creditBalance, creditHistory } from "./credit";
import { serviceDb } from "./db";
import { dayMonth, firstName } from "./format";
import { isGated, membershipState } from "./membership";
import { sendPush } from "./messages";
import { channelOn, prefsRow } from "./notification-prefs";
import { pushWords } from "./push/words";

/** The code's four characters: no 0, O, 1, I or L, so a code read out or typed is not mistaken. */
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_PATTERN = /^[A-Z]{1,12}-[2-9A-HJ-NP-Z]{4}$/;

/** "Albert Castle" -> "ALBERT-7K2Q": the first name in plain capitals (accents dropped), then four random characters. */
export function makeNominationCode(fullName: string | null | undefined, random: () => number = Math.random): string {
  const name =
    firstName(fullName)
      .normalize("NFD")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 12) || "MEMBER";
  let tail = "";
  for (let i = 0; i < 4; i += 1) tail += CODE_CHARS[Math.floor(random() * CODE_CHARS.length) % CODE_CHARS.length];
  return `${name}-${tail}`;
}

/** A code as someone typed it: trimmed, capitals, a space or no dash forgiven ("albert 7k2q", "ALBERT7K2Q"). */
export function cleanNominationCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const flat = raw.trim().toUpperCase().replace(/[\s_]+/g, "-");
  const dashed = flat.includes("-") ? flat : flat.replace(/^([A-Z]+)([2-9A-Z]{4})$/, "$1-$2");
  return CODE_PATTERN.test(dashed) ? dashed : null;
}

export const nominationLink = (code: string) => `${siteUrl()}/apply?n=${encodeURIComponent(code)}`;

/** What Share sends with the link (the member's own words would be better; this is the default the sheet fills in). */
export const nominationShareText = (code: string) =>
  `I’d like to nominate you for Club Yuppie. Apply with my link and the committee will know I put you forward. Or use my code, ${code}.`;

/** The member's code, made now if they have none (a clash with another code is tried again). */
export async function ensureNominationCode(memberId: string, fullName: string | null): Promise<string> {
  const db = serviceDb();
  const { data, error } = await db.from("members").select("nomination_code").eq("id", memberId).maybeSingle();
  if (error) throw error;
  if (data?.nomination_code) return data.nomination_code as string;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeNominationCode(fullName);
    const { data: set, error: setError } = await db
      .from("members")
      .update({ nomination_code: code })
      .eq("id", memberId)
      .is("nomination_code", null)
      .select("nomination_code")
      .maybeSingle();
    if (!setError) {
      if (set?.nomination_code) return set.nomination_code as string;
      // Someone else (another tab) made it first: read theirs.
      const { data: again } = await db.from("members").select("nomination_code").eq("id", memberId).maybeSingle();
      if (again?.nomination_code) return again.nomination_code as string;
    } else if (setError.code !== "23505") {
      throw setError;
    }
  }
  throw new Error(`nominations: could not make a code for ${memberId}`);
}

async function allowedAndUsed(memberId: string): Promise<{ allowed: number; used: number }> {
  const db = serviceDb();
  const [{ data: member, error }, { count, error: countError }] = await Promise.all([
    db.from("members").select("nominations_allowed").eq("id", memberId).maybeSingle(),
    db.from("applications").select("id", { count: "exact", head: true }).eq("nominated_by", memberId),
  ]);
  if (error) throw error;
  if (countError) throw countError;
  return { allowed: (member?.nominations_allowed as number | undefined) ?? NOMINATIONS_DEFAULT, used: count ?? 0 };
}

/** The You and Access card: nominations left and credit. */
export async function nominateCard(memberId: string): Promise<NominateCardData> {
  const [counts, creditPence] = await Promise.all([allowedAndUsed(memberId), creditBalance(memberId)]);
  return { ...counts, creditPence };
}

/** An application's status as its nominator sees it. */
function statusOf(row: { status: string; superseded_at: string | null }): NominationRow["status"] {
  if (row.status === "approved") return "approved";
  if (row.status === "pending") return "applied";
  return "used";
}

/** The Nominate page: the code (made now if need be), the link, the nominations and the credit. */
export async function nominatePage(member: { id: string; full_name: string | null }): Promise<NominatePageData> {
  const db = serviceDb();
  const code = await ensureNominationCode(member.id, member.full_name);
  const [card, { data: apps, error }, history] = await Promise.all([
    nominateCard(member.id),
    db
      .from("applications")
      .select("id, full_name, status, superseded_at, created_at")
      .eq("nominated_by", member.id)
      .order("created_at", { ascending: false })
      .limit(100),
    creditHistory(member.id),
  ]);
  if (error) throw error;
  const nominations: NominationRow[] = (apps ?? []).map((row) => ({
    id: row.id as string,
    firstName: firstName(row.full_name as string | null) || "Someone",
    status: statusOf(row as { status: string; superseded_at: string | null }),
    at: dayMonth(row.created_at as string),
  }));
  const link = nominationLink(code);
  return { ...card, code, link, shareText: nominationShareText(code), nominations, history };
}

export type NominationLookup =
  | { ok: true; memberId: string; firstName: string; left: number }
  | { ok: false; reason: "unknown" | "used" };

/** Who a code belongs to, and whether it has a nomination left. A member who is paused, ended or deleted has none. */
export async function lookupNominationCode(raw: unknown): Promise<NominationLookup> {
  const code = cleanNominationCode(raw);
  if (!code) return { ok: false, reason: "unknown" };
  const { data, error } = await serviceDb()
    .from("members")
    .select("id, full_name, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at")
    .eq("nomination_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "unknown" };
  if (data.deleted_at || isGated(membershipState(data as Parameters<typeof membershipState>[0]).state)) return { ok: false, reason: "unknown" };
  const { allowed, used } = await allowedAndUsed(data.id as string);
  const left = Math.max(0, allowed - used);
  if (!left) return { ok: false, reason: "used" };
  return { ok: true, memberId: data.id as string, firstName: firstName(data.full_name as string | null) || "A member", left };
}

/**
 * The committee approved a nominee (and their first month is paid): £10 of credit to the member who nominated
 * them, once, and a phone notification. Never throws (it runs after the approval).
 */
export async function grantNominationCredit(applicationId: string): Promise<{ added: boolean }> {
  try {
    const db = serviceDb();
    const { data: app, error } = await db.from("applications").select("id, full_name, status, nominated_by").eq("id", applicationId).maybeSingle();
    if (error) throw error;
    if (!app?.nominated_by || app.status !== "approved") return { added: false };
    const nominatorId = app.nominated_by as string;
    const saved = await addCredit({
      memberId: nominatorId,
      amountPence: NOMINATION_CREDIT_PENCE,
      kind: "nomination",
      applicationId,
      dedupeKey: `nomination:${applicationId}`,
    });
    if (!saved.ok || !saved.added) return { added: false };
    const { data: nominator } = await db.from("members").select("id, email, deleted_at").eq("id", nominatorId).maybeSingle();
    if (nominator && !nominator.deleted_at && pushLiveFor(nominator.email as string) && channelOn(await prefsRow(nominatorId), "push")) {
      const name = firstName(app.full_name as string | null) || "Your nominee";
      await sendPush({
        template: "push-nomination-credit",
        memberId: nominatorId,
        ...pushWords.nominationCredit(name, NOMINATION_CREDIT_PENCE),
        path: ROUTES.youNominate,
        dedupeKey: `push:nomination:${applicationId}`,
        refs: { applicationId },
      }).catch((err) => console.error(`nominations: the credit notification for ${applicationId} failed:`, err));
    }
    return { added: true };
  } catch (err) {
    console.error(`nominations: crediting the nominator of ${applicationId} failed:`, err);
    return { added: false };
  }
}
