import type { Metadata } from "next";
import type { ReactNode } from "react";

import { almarai, instrumentSerif } from "@/components/templates/creative-studio/fonts";
import { cn } from "@/lib/utils";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin: Club Yuppie",
  robots: { index: false, follow: false },
};

// Every admin page (Log in, the password reset and the console): the kit's fonts and the r2b admin look
// (app/admin/admin.css). The console's band, bar and nav are app/admin/(protected)/layout.tsx.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className={cn("ad", almarai.variable, instrumentSerif.variable)}>{children}</div>;
}
