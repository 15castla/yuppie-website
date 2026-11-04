"use client";

// Loading states (the loading rule: components/members/kit/main.tsx): the page's real title, or its back row,
// where it will be, and nothing else; the rest appears in one go. A real <main aria-busy="true"> with "Loading"
// for screen readers, so the app's launch picture keeps waiting; no spinner anywhere.
//   You         "Hey, Sam." (the first name the shell already has), in You's own title row
//   Event page  the back row

import "../you/you.css";
import "./system.css";

import { Suspense } from "react";

import { BackRow, Main, TitleBlock } from "@/components/members/kit";
import { useMember } from "@/components/members/shell/shell-context";
import { ROUTES } from "@/lib/members/routes";

function Greeting() {
  const member = useMember();
  return <>{member?.firstName ? `Hey, ${member.firstName}.` : "Hey there."}</>;
}

export function YouLoading() {
  return (
    <Main busy pad={false} className="yu-main sy-load-main">
      <span className="mk-sr">Loading</span>
      <div className="yu-title">
        <TitleBlock
          title={
            // Held by an invisible line of the same height, so nothing moves if the name arrives a moment later.
            <Suspense fallback={<span style={{ visibility: "hidden" }}>Hey there.</span>}>
              <Greeting />
            </Suspense>
          }
        />
      </div>
    </Main>
  );
}

export function EventLoading() {
  return (
    <Main busy className="sy-load-main">
      <span className="mk-sr">Loading</span>
      <BackRow href={ROUTES.events} label="Events" />
    </Main>
  );
}
