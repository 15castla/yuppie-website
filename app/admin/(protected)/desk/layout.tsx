import type { ReactNode } from "react";

import { requireDesk } from "@/app/admin/require-owner";
import "../../desk.css";

// The Outreach Desk (17 Nov 2026): the owner's only. This layout checks, and so does every desk page and action
// (a soft navigation can skip the layouts above a page).
export default async function DeskLayout({ children }: { children: ReactNode }) {
  await requireDesk();
  return children;
}
