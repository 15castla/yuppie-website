"use client";

// The last line of defence (r2b section 4): shown when the root layout itself fails. It replaces the root
// layout, so it has no web fonts, no stylesheet and no components: everything is inline here, the drawing
// is an inline SVG (the public brick phone), and the font is the phone's own. Same grammar and words as the
// page error, without the tab bar or links. Try again is a hard reload (the layout itself broke, so
// re-rendering a segment cannot help); its label becomes "Trying…" and nothing spins. The web draws the
// wordmark bar (the one static file); the app has none (its status area is the top).

import { useEffect, useState } from "react";

const INK = "#1B1512";
const YELLOW = "#FFD904";
const CREAM = "#F5F3E7";

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;background:${YELLOW};color:${INK}}
body{min-height:100dvh;display:flex;flex-direction:column;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.45;-webkit-font-smoothing:antialiased}
.ge-wrap{width:100%;max-width:1240px;margin:0 auto;padding-left:20px;padding-right:20px}
.ge-bar{height:56px;border-bottom:1.5px solid ${INK}}
.ge-bar .ge-wrap{display:flex;align-items:center;height:54px}
.ge-bar img{display:block;height:30px;width:auto}
.ge-app .ge-bar{display:none}
main{flex:1 0 auto;display:flex;flex-direction:column}
.ge-head{padding-top:28px;padding-bottom:28px}
.ge-app .ge-head{padding-top:calc(var(--native-safe-area-inset-top,env(safe-area-inset-top,0px)) + 10px)}
h1{margin:0;font-weight:800;letter-spacing:-.02em;font-size:34px;line-height:1.05}
.ge-lead{margin:14px 0 0;font-size:17px;line-height:1.45;max-width:30ch}
.ge-band{flex:1 0 auto;display:flex;flex-direction:column;background:${CREAM};border-top:3px solid ${INK};border-bottom:3px solid ${INK}}
.ge-band .ge-wrap{flex:1 0 auto;display:flex;flex-direction:column;padding-top:36px}
.ge-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;padding:0 28px;border:0;border-radius:999px;background:${INK};color:${YELLOW};font-family:inherit;font-weight:700;font-size:16px;line-height:1;cursor:pointer}
.ge-btn:focus-visible{outline:2px solid ${INK};outline-offset:2px}
.ge-btn span{grid-area:1/1}
.ge-btn .ge-in{display:inline-grid}
.ge-art{margin-top:auto;padding-top:44px;display:flex;justify-content:center;align-items:flex-end}
.ge-art svg{display:block;overflow:visible;height:168px;width:63.59px;stroke-width:2.53}
.ge-strip{flex:none;height:calc(var(--native-safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 24px)}
@media (min-width:768px){
  .ge-wrap{padding-left:clamp(20px,4vw,40px);padding-right:clamp(20px,4vw,40px)}
  .ge-head{padding-top:clamp(40px,5vw,72px);padding-bottom:clamp(40px,5vw,64px)}
  .ge-app .ge-head{padding-top:clamp(40px,5vw,72px)}
  h1{font-size:56px}
  .ge-lead{font-size:19px;line-height:1.5;max-width:38ch}
  .ge-band .ge-wrap{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:clamp(40px,5.5vw,80px);padding-top:48px}
  .ge-btn{display:inline-flex;width:auto;min-width:220px}
  .ge-words{align-self:start}
  .ge-art{margin-top:0;padding-top:0;align-self:end;justify-content:flex-end;padding-right:clamp(0px,3vw,40px)}
  .ge-art svg{height:232px;width:87.82px;stroke-width:2.29}
  .ge-strip{height:40px}
}
`;

// components/site/icons.tsx BrickPhoneDrawing, copied (this file may not import components), cropped to its ink box.
function BrickPhone() {
  const rows = [104, 117, 130, 143];
  const cols = [81, 95, 109];
  return (
    <svg viewBox="66.5 10.5 67 177" fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="80" y="12" width="14" height="30" rx="5" />
      <rect x="68" y="38" width="64" height="148" rx="10" fill={YELLOW} />
      <path d="M88,54 L112,54" />
      <path d="M88,61 L112,61" />
      <rect x="81" y="72" width="38" height="20" rx="3" fill={INK} />
      {rows.map((y) => cols.map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="7" rx="2" />))}
      <path d="M90,168 L110,168" />
    </svg>
  );
}

export default function GlobalError({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  const [trying, setTrying] = useState(false);
  const [app, setApp] = useState(false);

  useEffect(() => {
    console.error("Root layout error:", error, error.digest ? `(reference ${error.digest})` : "");
  }, [error]);
  useEffect(() => {
    // The app marks itself with this cookie (proxy.ts, lib/native-app.ts); read after the first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApp(document.cookie.split(";").some((c) => c.trim() === "is-native-app=1"));
  }, []);

  return (
    <html lang="en">
      <head>
        <title>That didn’t load.</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body className={app ? "ge-app" : undefined}>
        <div className="ge-bar">
          <div className="ge-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image is a component, and this page may use none */}
            <img src="/yuppie_logo_forte_forward.png" alt="Club Yuppie" width={91} height={30} />
          </div>
        </div>
        <main>
          <div className="ge-head">
            <div className="ge-wrap">
              <h1>That didn’t load.</h1>
              <p className="ge-lead">Check your connection and try again.</p>
            </div>
          </div>
          <section className="ge-band">
            <div className="ge-wrap">
              <div className="ge-words">
                <button
                  type="button"
                  className="ge-btn"
                  aria-busy={trying || undefined}
                  onClick={() => {
                    if (trying) return;
                    setTrying(true);
                    window.location.reload();
                  }}
                >
                  <span className="ge-in">
                    <span style={{ visibility: trying ? "hidden" : "visible" }} aria-hidden={trying || undefined}>
                      Try again
                    </span>
                    <span style={{ visibility: trying ? "visible" : "hidden" }} aria-hidden={!trying || undefined}>
                      Trying…
                    </span>
                  </span>
                </button>
              </div>
              <div className="ge-art">
                <BrickPhone />
              </div>
            </div>
          </section>
          <div className="ge-strip" aria-hidden="true" />
        </main>
      </body>
    </html>
  );
}
