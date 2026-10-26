// Kit counterpart: k2.dock(kind, active). The tab bar: docked, full width,
// solid yellow, a 3px ink rule above, 60px plus the safe area below, 23px icons
// over 11px/700 labels; the active tab is an ink rounded block with a yellow
// icon and label. Hidden from 768px (the desktop header takes over).
//
// SAFARI 26 TINT CONTRACT (needs_device_check). Safari 26 dropped theme-color.
// It scans fixed or sticky elements within about 3px of a viewport edge, at
// least 80% wide and 3px tall, for a literal background-color, and tints its
// toolbar with it. So the bar's outermost element, .mk-dock, is position:fixed
// at bottom:0, full width, with its own background-color (the yellow), and its
// height includes the home-indicator inset: the same math as the old bar in
// members-nav.tsx (height = 60px + 3px rule + max(inset - 6px, 0)). The old
// bar's compositor hints (translateZ(0), will-change) are kept, because a
// plain fixed bar janks while scrolling on iOS Safari. Pages with their own
// docked bar, and pages with no dock, get the .mk-tint strip instead
// (MembersFrame), so the contract holds on every route. An in-flow spacer of
// the same height (.mk-dock-spacer) keeps the page's bottom clearance.

import { Icon } from "../kit/icons";
import { KitLink } from "../kit/link";
import type { TabSpec } from "./tabs";
import type { TabKey } from "@/lib/members/routes";

export function DockBar({ tabs, activeTab }: { tabs: TabSpec[]; activeTab: TabKey | null }) {
  return (
    <div className="mk-dock" data-needs-device-check="true">
      <nav className="mk-tabbar" aria-label="Main">
        {tabs.map((tab) => (
          <KitLink
            key={tab.key}
            href={tab.href}
            className="mk-tab"
            aria-current={tab.key === activeTab ? "page" : undefined}
          >
            <span className="mk-in">
              <Icon name={tab.icon} size={23} />
              <span className="mk-lb">{tab.label}</span>
              {tab.badge ? (
                <span className="mk-badge">{tab.badge < 10 ? tab.badge : "9+"}</span>
              ) : null}
            </span>
          </KitLink>
        ))}
      </nav>
    </div>
  );
}
