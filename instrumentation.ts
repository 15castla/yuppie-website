import type { Instrumentation } from "next";

// One line in the server's log for every error the Next server catches, with the digest first: the error
// pages show the same digest as "Reference 3071294816" (r2b, decision B-D11 A), so a member can quote it
// and the club can find the error in the log (Vercel's runtime logs on the live site).
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "none";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[error] reference ${digest}: ${message} (${request.method} ${request.path}, ${context.routeType} ${context.routePath})`);
};
