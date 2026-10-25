import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { cn } from "@/lib/utils";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import "../members/members.css";
import "./preview.css";

// The members preview harness: a 404 unless MEMBERS_PREVIEW=1. The same font
// wrapper as app/members/layout.tsx, so type renders exactly as it does there.
export const metadata = { title: "Members preview", robots: { index: false, follow: false } };

export default function DevPreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.MEMBERS_PREVIEW !== "1") notFound();
  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex min-h-dvh flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{ fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif" }}
    >
      {children}
    </div>
  );
}
