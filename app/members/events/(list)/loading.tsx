import { Main, TitleBlock } from "@/components/members/kit";

// Events while the list loads: the real title block, nothing else (the loading
// rule: components/members/kit/main.tsx). A real <main aria-busy="true"> (the
// iOS app's splash hides once a <main> that is not aria-busy exists and no
// "animate-spin" element is on the page). It shows inside the shell, so the
// tab bar and photo are already drawn around it.
export default function EventsLoading() {
  return (
    <Main busy>
      <span className="mk-sr">Loading</span>
      <TitleBlock title="Events." sub="Run by us, at cost." />
    </Main>
  );
}
