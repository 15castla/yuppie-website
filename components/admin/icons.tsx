// The admin console's icons: the kit's set (components/members/kit/icons.tsx, not edited) plus the seven the
// r2b admin boards add in their own files (v4/pages_r2b.py, v4/pages_r2b_admin.py), path for path, lucide,
// 24px grid. The stroke comes from the .mk-ico rule in app/admin/admin.css.

import type { ReactElement } from "react";

import { Icon as KitIcon, type IconName as KitIconName } from "@/components/members/kit/icons";
import { cn } from "@/lib/utils";

const ADMIN_ICONS = {
  menu: (
    <>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </>
  ),
  download: (
    <>
      <path d="M12 15V3" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
    </>
  ),
  "circle-check": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  "arrow-down": (
    <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </>
  ),
  "chevron-up": <path d="m18 15-6-6-6 6" />,
  "arrow-left": (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type AdminIconName = KitIconName | keyof typeof ADMIN_ICONS;

/** Decorative (aria-hidden): the control around it carries the accessible name. */
export function Icon({ name, size = 22, className }: { name: AdminIconName; size?: number; className?: string }) {
  if (name in ADMIN_ICONS) {
    return (
      <svg className={cn("mk-ico", className)} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        {ADMIN_ICONS[name as keyof typeof ADMIN_ICONS]}
      </svg>
    );
  }
  return <KitIcon name={name as KitIconName} size={size} className={className} />;
}
