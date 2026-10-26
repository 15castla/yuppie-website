// Kit counterparts: k2.back(label) and the .subbar of a sub page (thread,
// plan, You sub pages): a 44px back link with a chevron, an optional title
// and subtitle in the middle, and actions at the end (the messages icon on an
// Open Invite plan page). On the web phone it replaces the shell's wordmark
// bar (the same 56px, rule below); in the app it sits under the status area.
// Hidden from 768px, where the desktop header is the only bar: a page draws
// its own back link in its content there.

import type { ReactNode } from "react";

import { Icon } from "./icons";
import { KitLink } from "./link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <KitLink href={href} className="mk-back">
      <Icon name="chevron-left" size={24} />
      <span>{label}</span>
    </KitLink>
  );
}

export function BackRow({
  href,
  label,
  title,
  subtitle,
  actions,
}: {
  href: string;
  label: string;
  /** A one-line title in the middle (a chat's name). */
  title?: ReactNode;
  /** A muted line under it ("3 of 4 going"). */
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mk-subbar">
      <BackLink href={href} label={label} />
      <div className="mk-mid">
        {title ? <b>{title}</b> : null}
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {actions}
    </header>
  );
}
