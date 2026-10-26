// Kit counterpart: k2.phone_bar(). The web phone's header: 56px, a 1.5px ink
// rule under it, the wordmark left, the messages icon (Open Invite pages only)
// and your photo right. A page that draws a BackRow replaces it (the CSS hides
// this bar when the page has a .mk-subbar).
//
// In the app there is no bar: the phone's own status area is the only bar,
// and the page's own title row (TitleBlock) or BackRow sits straight under it
// carrying the safe inset in its top padding. So the frame renders this for
// the web only, and from 768px the CSS hides it for the desktop header.

import { TopActions } from "./top-actions";
import { Wordmark } from "./wordmark";

export function TopBar({ landingHref }: { landingHref?: string }) {
  return (
    <header className="mk-bar">
      <Wordmark href={landingHref} />
      <div className="mk-r">
        <TopActions />
      </div>
    </header>
  );
}
