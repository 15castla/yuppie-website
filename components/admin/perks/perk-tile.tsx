// A discount's logo tile (or its first letter), a door's icon tile: 48px, 1.5px ink, cream (the members' row).

import { Icon } from "../icons";
import { ACCESS_KIND_ICON, type PerkRow } from "./perk-types";

export function PerkTile({ perk, logoUrl }: { perk: Pick<PerkRow, "type" | "access_kind" | "name" | "logo_url">; logoUrl?: string | null }) {
  const logo = logoUrl !== undefined ? logoUrl : perk.logo_url;
  if (perk.type === "access") {
    return (
      <span className="ad-tile" aria-hidden="true">
        <Icon name={perk.access_kind ? ACCESS_KIND_ICON[perk.access_kind] : "lock"} size={22} />
      </span>
    );
  }
  return (
    <span className="ad-tile" aria-hidden="true">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" />
      ) : (
        perk.name.trim().charAt(0).toUpperCase() || "?"
      )}
    </span>
  );
}
