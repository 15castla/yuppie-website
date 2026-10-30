import type { Metadata } from "next";

import { StandaloneScreen } from "@/components/members/system/standalone";
import { PublicNotFoundView } from "@/components/members/system/not-found-view";

// "Not on the list." for the whole site outside the members area (r2b section 3, B-D10 A): any address
// with no page, under the public header the root layout draws. The members area has its own
// (app/members/not-found.tsx), inside the members shell.
export const metadata: Metadata = { title: "Not on the list." };

export default function NotFound() {
  return (
    <StandaloneScreen>
      <PublicNotFoundView />
    </StandaloneScreen>
  );
}
