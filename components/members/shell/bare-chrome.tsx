// Renders nothing visible. A page that wants no shell chrome at all (no phone
// bar, no desktop header, no tab bar) renders this inside its <main>: the
// membership-ended gate does. The CSS hides the shell's bars while the marker
// is in the page (a :has() rule in members.css). Routes that are always bare
// (the photo gate) are marked in lib/members/routes.ts instead, which is
// instant, with no flash.

export function BareChrome() {
  return <span className="mk-bare-marker" hidden />;
}
