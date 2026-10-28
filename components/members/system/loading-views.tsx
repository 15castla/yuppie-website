"use client";

// Loading footprints (r2b section 8, decision B-D6 C): the page's real title, then pale shapes where the
// data goes, after about 300 ms (members.css). A real <main aria-busy="true"> with "Loading" for screen
// readers, so the app's launch picture keeps waiting; no spinner anywhere.
//   You         "Hey, Sam." (the first name the shell already has), shapes for the photo block, the
//               membership card and Your details, in You's own two-column layout from 768
//   Event page  the back row, then the picture, the title, the facts and the description as shapes, and on a
//               phone the fixed price and booking bar as shapes (needs_device_check, like the real bar)

import "../you/you.css";
import "./system.css";

import { Suspense } from "react";

import { BackRow, Main, Shape, TitleBlock } from "@/components/members/kit";
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
            <Suspense fallback={<Shape width="58%" height={44} />}>
              <Greeting />
            </Suspense>
          }
          sub={<Shape width={240} height={26} />}
        />
      </div>
      <div className="mk-wrap" aria-hidden="true">
        <div className="yu-cols">
          <div className="yu-photo-slot">
            <div className="sy-load-row">
              <Shape width={96} height={96} kind="disc" style={{ flex: "none" }} />
              <div className="sy-load-grow">
                <Shape width="70%" height={14} />
                <Shape width={160} height={44} kind="pill" style={{ marginTop: 14 }} />
              </div>
            </div>
          </div>
          <div className="yu-card-slot">
            <Shape width="100%" height={220} style={{ borderRadius: 20 }} />
          </div>
          <div className="yu-main-col">
            <section className="mk-section yu-first">
              <Shape width={150} height={28} />
              <div className="sy-load-rows">
                {[44, 58, 36].map((width) => (
                  <div className="sy-load-kv" key={width}>
                    <Shape width="22%" height={11} />
                    <Shape width={`${width}%`} height={16} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Main>
  );
}

export function EventLoading() {
  return (
    <>
      <Main busy className="sy-load-main">
        <span className="mk-sr">Loading</span>
        <BackRow href={ROUTES.events} label="Events" />
        <div className="mk-wrap sy-ev-wrap" aria-hidden="true">
          <i className="mk-sk sy-ev-hero" />
          <div style={{ marginTop: 24 }}>
            <Shape width="78%" height={34} />
            <Shape width="46%" height={34} style={{ marginTop: 10 }} />
          </div>
          <div className="sy-load-row" style={{ marginTop: 22, gap: 12 }}>
            <Shape width={44} height={44} kind="tile" style={{ flex: "none" }} />
            <div className="sy-load-grow">
              <Shape width="52%" height={14} />
              <Shape width="36%" height={12} style={{ marginTop: 8 }} />
            </div>
          </div>
          <div style={{ marginTop: 22 }}>
            <Shape width="100%" height={13} />
            <Shape width="94%" height={13} style={{ marginTop: 10 }} />
            <Shape width="62%" height={13} style={{ marginTop: 10 }} />
          </div>
        </div>
      </Main>
      <div className="sy-ev-bar-space" aria-hidden="true" />
      <div className="sy-ev-bar" aria-hidden="true" data-needs-device-check="true">
        <div>
          <Shape width={72} height={22} />
          <Shape width={110} height={12} style={{ marginTop: 8 }} />
        </div>
        <i className="mk-sk mk-sk-pill sy-ev-pill" />
      </div>
    </>
  );
}
