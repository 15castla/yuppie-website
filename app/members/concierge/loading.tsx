import { Main, TitleBlock } from "@/components/members/kit";
import "@/components/members/concierge/concierge.css";

// The Concierge while it loads: the real title, nothing else (the loading
// rule: components/members/kit/main.tsx). A real <main aria-busy="true">, no
// spinner (the iOS splash contract: see app/members/loading.tsx). The page is
// app only and flagged, so this only ever shows there. The page's own <main>
// (cn-page: a 720px column from 768px up, on an iPad or a phone on its side),
// so the title does not move sideways when the page arrives.
export default function ConciergeLoading() {
  return (
    <Main busy pad={false} className="cn-page">
      <span className="mk-sr">Loading</span>
      <TitleBlock title="Concierge." sub="It learns your taste." />
    </Main>
  );
}
