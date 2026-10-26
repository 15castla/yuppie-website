"use client";

// The "Posted." route's client half: reads the plan this tab just posted and
// draws PostedView. Nothing posted (a direct visit, a refreshed private
// window): back to the form. LOCAL DEMO STATE, see demo-posted.ts.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Main, Shape } from "@/components/members/kit";
import type { InviteMember } from "@/lib/members/invite/types";
import { ROUTES } from "@/lib/members/routes";
import { usePosted } from "./demo-posted";
import { PostedView } from "./post-view";

export function PostedRoute({ me }: { me: InviteMember }) {
  const router = useRouter();
  const posted = usePosted();
  useEffect(() => {
    if (posted === null) router.replace(ROUTES.openInviteNew);
  }, [posted, router]);
  if (!posted) {
    return (
      <Main busy pad={false}>
        <span className="mk-sr">Loading</span>
        <div className="mk-wrap">
          <Shape width="46%" height={46} style={{ marginTop: 28 }} />
        </div>
      </Main>
    );
  }
  return <PostedView invite={posted} me={me} />;
}
