// The kit's screen for a system page that has no members shell around it: the public 404 and page error
// (under the public header the root layout draws) and maintenance (a bare wordmark bar, or nothing in the
// app). It carries the kit's fonts and stylesheet itself, because only the members layout loads them.

import "@/app/members/members.css";
import "./system.css";

import Image from "next/image";
import type { ReactNode } from "react";

import type { ShellMode } from "@/components/members/shell/types";
import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { cn } from "@/lib/utils";

export function StandaloneScreen({ mode = "web", children }: { mode?: ShellMode; children: ReactNode }) {
  return (
    <div
      className={cn(almarai.variable, instrumentSerif.variable, "mk-screen sy-standalone", mode === "app" ? "mk-app" : "mk-web")}
      data-mode={mode}
    >
      <div className="mk-page">{children}</div>
    </div>
  );
}

/** The web's bare bar: the wordmark only, not a link (nothing to click into while the site is being changed). The app has none. */
export function BareBar() {
  return (
    <div className="sy-bare-bar">
      <div className="mk-wrap">
        <div className="sy-bare-in">
          <Image src="/yuppie_logo_forte_forward.png" alt="Club Yuppie" width={1942} height={641} sizes="92px" loading="eager" className="mk-wm" />
        </div>
      </div>
    </div>
  );
}
