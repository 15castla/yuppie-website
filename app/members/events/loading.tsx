import { LoadingShapes, Main, TitleBlock } from "@/components/members/kit";

// Events while the list loads: the real title block, then pale shapes where
// the chips and rows will be. A real <main aria-busy="true"> (the iOS app's
// splash hides once a <main> that is not aria-busy exists and no
// "animate-spin" element is on the page), static shapes, no spinner. It shows
// inside the shell, so the tab bar and photo are already drawn around it.
export default function EventsLoading() {
  return (
    <Main busy>
      <LoadingShapes chips title={<TitleBlock title="Events." sub="Run by us, at cost." />} />
    </Main>
  );
}
