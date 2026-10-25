import { LoadingShapes } from "@/components/members/kit/loading-shapes";
import { Main } from "@/components/members/kit/main";

// The members area's loading state, in the new look: pale shapes where the
// page will be, a real <main aria-busy="true">, no spinner. The iOS app's
// splash (mobile/ios/App/App/SceneDelegate.swift) hides once a <main> that is
// not aria-busy exists and no "animate-spin" element is on the page, so this
// never hides it early, and it hides onto the real page. It shows inside the
// shell (the tab bar and photo are already drawn around it), for any members
// route that has no loading.tsx of its own. A route whose page knows its
// title can ship its own loading.tsx with the real title in LoadingShapes.
export default function MembersLoading() {
  return (
    <Main busy>
      <LoadingShapes />
    </Main>
  );
}
