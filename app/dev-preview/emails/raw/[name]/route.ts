// One email as a mail app gets it, for the preview's frames and for
// screenshots: /dev-preview/emails/raw/<name>?fixture=<id>&dark=1&part=text.
// dark=1 forces the designed dark palette (as the r2c -dark files); without
// it the email follows prefers-color-scheme. Images and links point at this
// server, so public/email/ is what loads. A 404 unless MEMBERS_PREVIEW=1, like
// the rest of the harness (route handlers do not pass through its layout).

import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

import { forceDark, renderPreview } from "../../preview-data";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.MEMBERS_PREVIEW !== "1") notFound();
  const { name } = await params;
  const search = request.nextUrl.searchParams;
  const rendered = renderPreview(name, search.get("fixture") ?? undefined, request.nextUrl.origin);
  if (!rendered) notFound();
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (search.get("part") === "text") {
    return new Response(rendered.text, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const body = search.get("dark") === "1" ? forceDark(rendered.html) : rendered.html;
  return new Response(body, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
