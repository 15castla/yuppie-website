"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

import { reorderPerks } from "@/app/admin/discounts-actions";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { EditPerkForm } from "./EditPerkForm";

// Local optimistic order, seeded from the server-fetched perks and kept in
// sync with them (see the effect below). reorderPerks is only called once
// dragging settles (onDragEnd), not on every intermediate frame, so a drag
// in progress never spams the server with writes.
export function DiscountsList({
  perks,
  deletePerkAction,
}: {
  perks: PartnerPerk[];
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
    void reorderPerks("discount", orderedIds);
  }

  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-6">
      {items.map((perk) => (
        <PerkRow key={perk.id} perk={perk} deletePerkAction={deletePerkAction} onDragEnd={handleDragEnd} />
      ))}
    </Reorder.Group>
  );
}

function PerkRow({
  perk,
  deletePerkAction,
  onDragEnd,
}: {
  perk: PartnerPerk;
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

      <EditPerkForm perk={perk} />

      <form action={deletePerkAction} className="shrink-0 self-start">
        <input type="hidden" name="id" value={perk.id} />
        <button
          type="submit"
          className="text-xs font-medium text-foreground/40 underline underline-offset-2 hover:text-red-700"
        >
          Delete
        </button>
      </form>
    </Reorder.Item>
  );
}
