import type { ReactNode } from "react";

import { requireMessages } from "./guard";

// Messages' door for its pages: in the app while Open Invite is hidden there, and with the flag off, the 404 is all
// that is drawn (QB1-09), never the inbox first. The pages and the actions check again (./guard.ts).
export default async function MessagesLayout({ children }: { children: ReactNode }) {
  await requireMessages();
  return children;
}
