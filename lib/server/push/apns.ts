import "server-only";

// Apple's push service (APNs) over HTTP/2 with token auth (the .p8 key, lib/server/config.ts apnsConfig). One
// connection per host for a batch, one request per device. Never throws for a device: each answer says what
// happened, so the caller can drop a token Apple no longer knows (410 Unregistered, 400 BadDeviceToken).
//
// The provider token is a JWT signed ES256 with the key, reused for 40 minutes (Apple asks for a new one at most
// every 20 minutes and refuses one older than an hour).

import crypto from "node:crypto";
import http2 from "node:http2";

import { APNS_TOPIC, apnsConfig, apnsOrigin } from "../config";

export type ApnsEnvironment = "sandbox" | "production";

export type ApnsMessage = {
  token: string;
  environment: ApnsEnvironment;
  payload: Record<string, unknown>;
  /** Replaces an earlier notification with the same id (one per chat), at most 64 bytes. */
  collapseId?: string;
  /** Seconds since 1970 after which Apple stops trying (a reminder is no use after its plan starts). */
  expiration?: number;
};

export type ApnsResult = {
  token: string;
  status: number;
  /** Apple's reason, e.g. "Unregistered", "BadDeviceToken"; or the connection's error. */
  reason?: string;
  /** The token is dead: remove the device. */
  gone: boolean;
};

const TOKEN_TTL_MS = 40 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
let cached: { jwt: string; madeAt: number; keyId: string } | null = null;

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** The provider token (a JWT, ES256). Null when the key is not set. */
export function providerToken(now = Date.now()): string | null {
  const config = apnsConfig();
  if (!config) return null;
  if (cached && cached.keyId === config.keyId && now - cached.madeAt < TOKEN_TTL_MS) return cached.jwt;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: crypto.createPrivateKey(config.key),
    dsaEncoding: "ieee-p1363",
  });
  const jwt = `${header}.${claims}.${b64url(signature)}`;
  cached = { jwt, madeAt: now, keyId: config.keyId };
  return jwt;
}

/** Forget the provider token (Apple said it was expired or invalid): the next batch makes a new one. */
export function resetProviderToken(): void {
  cached = null;
}

function sendOne(session: http2.ClientHttp2Session, jwt: string, m: ApnsMessage): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: Omit<ApnsResult, "token">) => {
      if (settled) return;
      settled = true;
      resolve({ token: m.token, ...r });
    };
    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `/3/device/${m.token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    };
    if (m.collapseId) headers["apns-collapse-id"] = m.collapseId.slice(0, 64);
    if (m.expiration) headers["apns-expiration"] = String(m.expiration);
    let req: http2.ClientHttp2Stream;
    try {
      req = session.request(headers);
    } catch (err) {
      finish({ status: 0, reason: err instanceof Error ? err.message : String(err), gone: false });
      return;
    }
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      finish({ status: 0, reason: "timeout", gone: false });
    });
    req.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
    });
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {
        reason = body.slice(0, 200) || undefined;
      }
      const gone = status === 410 || (status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"));
      finish({ status, reason, gone });
    });
    req.on("error", (err) => finish({ status: 0, reason: err.message, gone: false }));
    req.end(JSON.stringify(m.payload));
  });
}

/** Send each message (grouped by host). One answer per message, in the same order. */
export async function sendApns(messages: ApnsMessage[]): Promise<ApnsResult[]> {
  if (!messages.length) return [];
  let jwt: string | null;
  try {
    jwt = providerToken();
  } catch (err) {
    const reason = `APNs key could not be read: ${err instanceof Error ? err.message : String(err)}`;
    return messages.map((m) => ({ token: m.token, status: 0, reason, gone: false }));
  }
  if (!jwt) return messages.map((m) => ({ token: m.token, status: 0, reason: "APNs key not set (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID)", gone: false }));
  const results = new Map<ApnsMessage, ApnsResult>();
  for (const environment of ["production", "sandbox"] as const) {
    const batch = messages.filter((m) => m.environment === environment);
    if (!batch.length) continue;
    let session: http2.ClientHttp2Session | null = null;
    try {
      session = http2.connect(apnsOrigin(environment));
      session.on("error", () => {});
      const answers = await Promise.all(batch.map((m) => sendOne(session!, jwt!, m)));
      batch.forEach((m, i) => results.set(m, answers[i]));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      for (const m of batch) if (!results.has(m)) results.set(m, { token: m.token, status: 0, reason, gone: false });
    } finally {
      session?.close();
    }
  }
  if ([...results.values()].some((r) => r.status === 403 && /ProviderToken/.test(r.reason ?? ""))) resetProviderToken();
  return messages.map((m) => results.get(m) ?? { token: m.token, status: 0, reason: "not sent", gone: false });
}
