import { Main, Shape, TitleBlock } from "@/components/members/kit";

// The Concierge while it loads: the real title, then pale shapes where the
// intro and the three "Try asking" tiles will be. A real <main
// aria-busy="true">, static shapes, no spinner (the iOS splash contract: see
// app/members/loading.tsx). The page is app only and flagged, so this only
// ever shows there.
export default function ConciergeLoading() {
  return (
    <Main busy>
      <span className="mk-sr">Loading</span>
      <TitleBlock title="Concierge." sub="It learns your taste." />
      <div className="mk-wrap" aria-hidden="true">
        <Shape width="62%" height={20} style={{ marginTop: 56 }} />
        <Shape width="48%" height={20} style={{ marginTop: 8 }} />
        <Shape width={132} height={30} style={{ marginTop: 64, marginBottom: 14 }} />
        {[0, 1, 2].map((i) => (
          <Shape key={i} width="100%" height={68} kind="tile" style={{ marginBottom: 10, borderRadius: 20 }} />
        ))}
      </div>
    </Main>
  );
}
