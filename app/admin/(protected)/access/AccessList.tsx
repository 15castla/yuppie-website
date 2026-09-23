"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

import { reorderPerks } from "@/app/admin/discounts-actions";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { AccessPerkRow } from "./AccessPerkRow";

// Mirrors app/admin/(protected)/discounts/DiscountsList.tsx exactly, just
// for type: "access" perks. See that file for the reasoning behind the
// optimistic local state and onDragEnd-only server call.
export function AccessList({
  perks,
  updatePerkAction,
  deletePerkAction,
}: {
  perks: PartnerPerk[];
  updatePerkAction: (formData: FormData) => void;
  deletePerkAction: (formData: FormData) => void;
}) {
  const [items, setItems] = useState(perks);
  const perksRef = useRef(perks);

  useEffect(() => {
    if (perksRef.current !== perks) {
      perksRef.current = perks;
      setItems(perks);
    }
  }, [perks]);

  function handleDragEnd() {
    const orderedIds = items.map((perk) => perk.id);
    void reorderPerks("access", orderedIds);
  }

  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-6">
      {items.map((perk) => (
        <PerkRow
          key={perk.id}
          perk={perk}
          updatePerkAction={updatePerkAction}
          deletePerkAction={deletePerkAction}
          onDragEnd={handleDragEnd}
        />
      ))}
    </Reorder.Group>
  );
}

function PerkRow({
  perk,
  updatePerkAction,
  deletePerkAction,
  onDragEnd,
}: {
  perk: PartnerPerk;
  updatePerkAction: (formData: FormData) => void;
  deletePerkAction: (formData: FormData) => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={perk}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="flex flex-col gap-6 rounded-2xl border border-foreground/10 bg-cream p-6 sm:flex-row sm:items-start"
    >
      <button
        type="button"
        onPointerDown={(event) => controls.start(event)}
        className="shrink-0 cursor-grab self-start text-foreground/30 hover:text-foreground/60 active:cursor-grabbing sm:self-center"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <AccessPerkRow perk={perk} updatePerkAction={updatePerkAction} deletePerkAction={deletePerkAction} />
    </Reorder.Item>
  );
}
