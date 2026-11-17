"use server";

// The Outreach Desk's Alex actions (Phase 3, 17 Nov 2026): connecting Claude to the desk (the consent page's Connect
// and Don't connect), disconnecting it, and Albert's guidance for each kind of email Alex writes. Each checks the
// owner (requireOwner(): signed in, an admin, aal2, the owner) and writes one admin_audit row (ids and kinds only).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { audit } from "@/lib/server/audit";
import { serviceDb } from "@/lib/server/db";
import { OAuthError, checkAuthorize, issueCode, type AuthorizeRequest } from "@/lib/server/outreach/connector";
import { GUIDANCE_KINDS, type GuidanceKind } from "@/lib/server/outreach/guidance";
import { isKey } from "@/lib/server/outreach/model";
import { requireOwner } from "./require-owner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORIZE_FIELDS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

function field(fd: FormData, key: string, max = 8000): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, max) : null;
}

function go(path: string, param: "done" | "error", code: string, hash = ""): never {
  revalidatePath("/admin/desk", "layout");
  redirect(`${path}?${param}=${encodeURIComponent(code)}${hash}`);
}

/** The authorize request again, from the consent form's hidden fields, checked again (it could have been changed). */
async function authorizeFrom(fd: FormData): Promise<AuthorizeRequest> {
  const q = new URLSearchParams();
  for (const key of AUTHORIZE_FIELDS) {
    const v = fd.get(key);
    if (typeof v === "string" && v) q.set(key, v);
  }
  try {
    return await checkAuthorize(serviceDb(), q);
  } catch (err) {
    if (err instanceof OAuthError) go("/admin/desk/settings", "error", "connect_failed", "#alex");
    throw err;
  }
}

function back(req: AuthorizeRequest, params: Record<string, string>): never {
  const url = new URL(req.redirect_uri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (req.state) url.searchParams.set("state", req.state);
  redirect(url.toString());
}

/** The consent page's Connect: a one-off code (10 minutes) back to Claude. */
export async function deskConnectApprove(fd: FormData): Promise<void> {
  const owner = await requireOwner();
  const req = await authorizeFrom(fd);
  const code = await issueCode(serviceDb(), req, owner.id);
  await audit(owner.id, "desk.connector.approve", { type: "desk_connector_client", id: req.client_id }, {});
  back(req, { code });
}

/** The consent page's Don't connect. */
export async function deskConnectDeny(fd: FormData): Promise<void> {
  const owner = await requireOwner();
  const req = await authorizeFrom(fd);
  await audit(owner.id, "desk.connector.deny", { type: "desk_connector_client", id: req.client_id }, {});
  back(req, {
    error: "access_denied",
    error_description: "Albert didn't connect the desk.",
  });
}

/** Desk > Settings: ends a connection at once. Claude has to be connected again (password and code) to reach the desk. */
export async function deskDisconnectConnector(fd: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = field(fd, "grant", 60);
  if (!id || !UUID.test(id)) go("/admin/desk/settings", "error", "not_found", "#alex");
  const { data } = await serviceDb()
    .from("desk_connector_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (!data?.length) go("/admin/desk/settings", "error", "not_found", "#alex");
  await audit(owner.id, "desk.connector.disconnect", { type: "desk_connector_grant", id }, {});
  go("/admin/desk/settings", "done", "disconnected", "#alex");
}

/**
 * Desk > Settings: Albert's guidance for one kind of email. Save keeps it as a draft (and stops Alex writing that kind
 * until it's approved again); Approve saves and approves it; Stop takes the approval away.
 */
export async function deskSaveGuidance(fd: FormData): Promise<void> {
  const owner = await requireOwner();
  const kind = field(fd, "kind", 40);
  if (!isKey(GUIDANCE_KINDS, kind)) go("/admin/desk/settings", "error", "not_found", "#alex");
  const k = kind as GuidanceKind;
  const db = serviceDb();
  const intent = field(fd, "intent", 20);
  if (intent === "stop") {
    await db
      .from("outreach_guidance")
      .update({
        approved_at: null,
        approved_by: null,
        updated_at: new Date().toISOString(),
        updated_by: owner.id,
      })
      .eq("kind", k);
    await audit(owner.id, "desk.guidance.stop", { type: "outreach_guidance", id: null }, { kind: k });
    go("/admin/desk/settings", "done", "guidance_stopped", `#g-${k}`);
  }
  const instructions = field(fd, "instructions");
  if (!instructions) go("/admin/desk/settings", "error", "missing", `#g-${k}`);
  const example = field(fd, "example");
  const now = new Date().toISOString();
  const approve = intent === "approve";
  const { error } = await db.from("outreach_guidance").upsert(
    {
      kind: k,
      instructions,
      example,
      approved_at: approve ? now : null,
      approved_by: approve ? owner.id : null,
      updated_at: now,
      updated_by: owner.id,
    },
    { onConflict: "kind" },
  );
  if (error) go("/admin/desk/settings", "error", "failed", `#g-${k}`);
  await audit(
    owner.id,
    approve ? "desk.guidance.approve" : "desk.guidance.save",
    { type: "outreach_guidance", id: null },
    { kind: k, chars: instructions.length },
  );
  go("/admin/desk/settings", "done", approve ? "guidance_approved" : "guidance_saved", `#g-${k}`);
}

/** A partner's page: removes a reply Alex wrote before the drafter makes it into an Outlook draft. */
export async function deskDiscardReplyText(fd: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = field(fd, "text", 60);
  const backField = field(fd, "back", 300);
  const back = backField && /^\/admin\/desk(\/[A-Za-z0-9/_-]*)?$/.test(backField) ? backField : "/admin/desk";
  if (!id || !UUID.test(id)) go(back, "error", "not_found");
  const db = serviceDb();
  const { data: t } = await db.from("outreach_draft_texts").select("id, target_id, status, kind").eq("id", id).maybeSingle();
  if (!t || t.kind !== "reply" || t.status === "discarded") go(back, "error", "not_found");
  if (t.status === "drafted") go(back, "error", "drafted_already");
  await db.from("outreach_draft_texts").update({ status: "discarded" }).eq("id", id).eq("status", "written");
  await audit(owner.id, "desk.reply.text_remove", { type: "outreach_draft_text", id }, { target: t.target_id });
  go(back, "done", "reply_removed");
}
