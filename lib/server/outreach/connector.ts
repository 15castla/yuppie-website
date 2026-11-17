import "server-only";

// The Desk connector's sign-in (Phase 3, 17 Nov 2026): OAuth 2.1 with PKCE, as Claude's custom connectors expect.
// Claude registers itself (dynamic client registration, callbacks on claude.ai or claude.com only), sends Albert to
// /api/desk/oauth/authorize, which hands over to the consent page at /admin/desk/connect (the owner, signed in with
// password and authenticator code). His "Connect" makes a one-off code; Claude swaps it (with the PKCE verifier) for
// an access token (1 hour) and a refresh token (90 days, a new one each time it's used). Only SHA-256 hashes of codes
// and tokens are stored. Desk > Settings lists the connections and disconnects them at once.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ServiceDb } from "@/lib/server/db";

export const ACCESS_SECONDS = 3600;
export const REFRESH_DAYS = 90;
export const CODE_SECONDS = 600;
export const SCOPE = "desk";

/** Where Claude sends the browser back after Albert says yes. Nothing else may receive a code. */
const CLAUDE_CALLBACKS = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);

function testMode(): boolean {
  return process.env.MEMBERS_TEST_HOOKS === "on" && process.env.VERCEL_ENV !== "production";
}

export function allowedRedirect(uri: string): boolean {
  if (CLAUDE_CALLBACKS.has(uri)) return true;
  // the tests (never on the live site): a local callback
  return testMode() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[A-Za-z0-9/_-]*$/.test(uri);
}

export const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const token = () => randomBytes(32).toString("base64url");

export class OAuthError extends Error {
  constructor(public code: string, public description: string, public status = 400) {
    super(description);
  }
}

/** A few calls a minute is all Claude needs; more is someone trying their luck (per server instance). */
const recent = new Map<string, number[]>();
export function tooMany(bucket: string, perMinute: number, now = Date.now()): boolean {
  const list = (recent.get(bucket) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) {
    recent.set(bucket, list);
    return true;
  }
  list.push(now);
  recent.set(bucket, list);
  return false;
}

/** Dynamic client registration (RFC 7591), public clients only. */
export async function registerClient(db: ServiceDb, body: Record<string, unknown>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || !uris.every(allowedRedirect)) throw new OAuthError("invalid_redirect_uri", "Only Claude can connect to the desk.");
  // registrations that never connected, after 30 days, and codes a day past their 10 minutes: tidied as we go
  const { data: used } = await db.from("desk_connector_grants").select("client_id");
  const keep = [...new Set((used ?? []).map((g) => g.client_id as string))];
  let stale = db.from("desk_connector_clients").delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  if (keep.length) stale = stale.not("client_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  await stale;
  await db.from("desk_connector_codes").delete().lt("expires_at", new Date(Date.now() - 86400_000).toISOString());
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "Claude";
  const clientId = `desk_${randomBytes(16).toString("hex")}`;
  const { error } = await db.from("desk_connector_clients").insert({ client_id: clientId, client_name: name, redirect_uris: uris });
  if (error) throw new OAuthError("server_error", "Couldn't register.", 500);
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
}

export type AuthorizeRequest = { client_id: string; redirect_uri: string; code_challenge: string; state: string | null; client_name: string | null };

/** The authorize request, checked before Albert is asked anything. */
export async function checkAuthorize(db: ServiceDb, q: URLSearchParams): Promise<AuthorizeRequest> {
  const clientId = q.get("client_id") ?? "";
  const redirect = q.get("redirect_uri") ?? "";
  const { data: client } = await db.from("desk_connector_clients").select("client_id, client_name, redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!client) throw new OAuthError("invalid_client", "This connection isn't registered. Start again from Claude.");
  if (!(client.redirect_uris as string[]).includes(redirect) || !allowedRedirect(redirect)) throw new OAuthError("invalid_request", "That return address isn't allowed.");
  if (q.get("response_type") !== "code") throw new OAuthError("unsupported_response_type", "Only the code flow is supported.");
  const challenge = q.get("code_challenge") ?? "";
  if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) throw new OAuthError("invalid_request", "PKCE (S256) is required.");
  return { client_id: clientId, redirect_uri: redirect, code_challenge: challenge, state: q.get("state"), client_name: client.client_name as string | null };
}

/** Albert said yes: a one-off code for Claude, valid 10 minutes. */
export async function issueCode(db: ServiceDb, req: AuthorizeRequest, ownerId: string): Promise<string> {
  const code = token();
  const { error } = await db.from("desk_connector_codes").insert({
    code_hash: sha(code),
    client_id: req.client_id,
    redirect_uri: req.redirect_uri,
    code_challenge: req.code_challenge,
    owner_id: ownerId,
    expires_at: new Date(Date.now() + CODE_SECONDS * 1000).toISOString(),
  });
  if (error) throw new OAuthError("server_error", "Couldn't connect.", 500);
  return code;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function newTokens(db: ServiceDb, grantId: string | null, clientId: string, clientName: string | null, ownerId: string, oldRefreshHash?: string) {
  const access = token();
  const refresh = token();
  const row = {
    access_hash: sha(access),
    access_expires_at: new Date(Date.now() + ACCESS_SECONDS * 1000).toISOString(),
    refresh_hash: sha(refresh),
    refresh_expires_at: new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString(),
  };
  if (grantId) {
    // the old refresh token works once: only the request that swaps it gets the new pair
    const { data, error } = await db.from("desk_connector_grants").update(row).eq("id", grantId).eq("refresh_hash", oldRefreshHash ?? "").is("revoked_at", null).select("id");
    if (error) throw new OAuthError("server_error", "Couldn't sign in.", 500);
    if (!data?.length) throw new OAuthError("invalid_grant", "That refresh token was used. Connect the desk again in Claude's settings.");
  } else {
    const { error } = await db.from("desk_connector_grants").insert({ ...row, client_id: clientId, client_name: clientName, owner_id: ownerId });
    if (error) throw new OAuthError("server_error", "Couldn't sign in.", 500);
  }
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: SCOPE };
}

/** The token endpoint: a code (with the PKCE verifier) or a refresh token, for tokens. */
export async function exchange(db: ServiceDb, form: URLSearchParams) {
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const { data: row } = await db.from("desk_connector_codes").select("*").eq("code_hash", sha(code)).maybeSingle();
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) throw new OAuthError("invalid_grant", "That code has expired or was used. Connect again from Claude.");
    // one use only, even if what follows fails
    const { data: claimed } = await db.from("desk_connector_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", row.code_hash).is("used_at", null).select("code_hash");
    if (!claimed?.length) throw new OAuthError("invalid_grant", "That code was used.");
    if ((clientId && clientId !== row.client_id) || (form.get("redirect_uri") ?? row.redirect_uri) !== row.redirect_uri) throw new OAuthError("invalid_grant", "That code isn't for this client.");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (!verifier || !same(challenge, row.code_challenge)) throw new OAuthError("invalid_grant", "The PKCE check failed.");
    const { data: client } = await db.from("desk_connector_clients").select("client_name").eq("client_id", row.client_id).maybeSingle();
    return newTokens(db, null, row.client_id, (client?.client_name as string) ?? null, row.owner_id);
  }
  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token") ?? "";
    const { data: g } = await db.from("desk_connector_grants").select("*").eq("refresh_hash", sha(refresh)).is("revoked_at", null).maybeSingle();
    if (!g || new Date(g.refresh_expires_at).getTime() < Date.now() || (clientId && clientId !== g.client_id)) {
      throw new OAuthError("invalid_grant", "This connection has ended. Connect the desk again in Claude's settings.");
    }
    const { data: owner } = await db.from("admin_users").select("is_owner").eq("id", g.owner_id).maybeSingle();
    if (!owner?.is_owner) throw new OAuthError("invalid_grant", "This connection has ended.");
    return newTokens(db, g.id, g.client_id, g.client_name, g.owner_id, g.refresh_hash);
  }
  throw new OAuthError("unsupported_grant_type", "Only authorization_code and refresh_token.");
}

export type Grant = { id: string; owner_id: string; client_name: string | null };

/** The connection a Bearer token belongs to, when it's current and not disconnected. */
export async function grantFor(db: ServiceDb, header: string | null): Promise<Grant | null> {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header ?? "");
  if (!m) return null;
  const { data: g } = await db.from("desk_connector_grants").select("id, owner_id, client_name, access_expires_at, last_used_at").eq("access_hash", sha(m[1])).is("revoked_at", null).maybeSingle();
  if (!g || new Date(g.access_expires_at).getTime() < Date.now()) return null;
  // the owner must still be the owner (the flag can move, or he could stop being an admin)
  const { data: owner } = await db.from("admin_users").select("is_owner").eq("id", g.owner_id).maybeSingle();
  if (!owner?.is_owner) return null;
  if (!g.last_used_at || Date.now() - new Date(g.last_used_at).getTime() > 60_000) {
    await db.from("desk_connector_grants").update({ last_used_at: new Date().toISOString() }).eq("id", g.id);
  }
  return { id: g.id, owner_id: g.owner_id, client_name: g.client_name };
}

/** The issuer's metadata (RFC 8414) and the resource's (RFC 9728), for Claude to find the sign-in. */
export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/desk/oauth/authorize`,
    token_endpoint: `${origin}/api/desk/oauth/token`,
    registration_endpoint: `${origin}/api/desk/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  };
}

export function resourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/desk/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Club Yuppie Outreach Desk",
  };
}

/** The public address the request came to (behind Vercel, its own host). */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
