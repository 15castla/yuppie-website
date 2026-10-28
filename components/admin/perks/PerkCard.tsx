// The discount or door card (r2b 18). Server component: the form is PerkForm (client).

import { Card, SavedLine } from "../ui";
import { PerkForm } from "./PerkForm";
import { PerkTile } from "./perk-tile";
import { PERK_WORDS, perkMeta, type PerkRow, type PerkType } from "./perk-types";

export function PerkCard({
  type,
  perk,
  position,
  total,
  categories,
  created = false,
}: {
  type: PerkType;
  perk: PerkRow;
  position: number;
  total: number;
  categories: string[];
  created?: boolean;
}) {
  const headId = `perk-${perk.id}`;
  return (
    <Card labelledBy={headId}>
      <div className="ad-dh">
        <PerkTile perk={perk} />
        <div className="tt">
          <h2 id={headId} className="ad-h2">
            {perk.name}
          </h2>
          <p className="sub">{perkMeta(perk)}</p>
        </div>
      </div>
      {created && (
        <div style={{ marginTop: 14 }}>
          <SavedLine>Added. Members see it now, at the bottom of the list.</SavedLine>
        </div>
      )}
      <PerkForm key={`${perk.id}-${position}`} type={type} perk={perk} position={position} total={total} categories={categories} />
    </Card>
  );
}

export function NewPerkCard({ type, categories }: { type: PerkType; categories: string[] }) {
  const words = PERK_WORDS[type];
  return (
    <Card labelledBy={`new-${type}`}>
      <div className="ad-dh">
        <div className="tt">
          <h2 id={`new-${type}`} className="ad-h2">
            New {words.one}
          </h2>
          <p className="sub">It goes to the bottom of the list. Move it when you’re ready.</p>
        </div>
      </div>
      <PerkForm type={type} categories={categories} />
    </Card>
  );
}
