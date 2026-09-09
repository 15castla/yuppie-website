import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { MembersNav } from "@/components/members/members-nav";
import { requireMember } from "./require-member";

export default async function MembersLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Auth gate only — each page re-fetches the member row it needs via
  // requireMember(), same style as app/admin/(protected)/layout.tsx does
  // with requireAdmin().
  await requireMember();

  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex min-h-dvh flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section className="relative flex flex-1 flex-col">
        <MembersNav />
        {children}
      </section>
    </div>
  );
}
