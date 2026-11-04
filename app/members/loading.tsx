import { Main } from "@/components/members/kit/main";

// The members area's loading state: the plain page, nothing else (the rule is
// in components/members/kit/main.tsx: a page that knows its title shows just
// that, never placeholder shapes). A real
// <main aria-busy="true">, no spinner: the iOS app's launch picture
// (mobile/ios/App/App/SceneDelegate.swift) hides once a <main> that is not
// aria-busy exists and no "animate-spin" element is on the page, so this never
// hides it early. It shows inside the shell (the tab bar and photo are already
// drawn around it), for any members route without a loading.tsx of its own.
export default function MembersLoading() {
  return (
    <Main busy>
      <span className="mk-sr">Loading</span>
    </Main>
  );
}
