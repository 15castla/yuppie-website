"use client";

// The Discounts and Access lists (r2b 18): members see them in this order. Drag a row by its handle to reorder
// (the card also has Move up and Move down, B-D19). Search by name, area or category and nine rows, then
// Show more (B-D18). While a search is on, the order can't be dragged (the list isn't the whole list).

import { Reorder, useDragControls } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { reorderPerks } from "@/app/admin/discounts-actions";
import { ErrorLine, Pill } from "../ui";
import { Icon } from "../icons";
import { MoreLine, PAGE_SIZE, SearchBox, norm, rowsToShow, useListParams, useSearchState } from "../list-controls";
import { useOpenId } from "../split-shell";
import { PerkTile } from "./perk-tile";
import { PERK_WORDS, perkMeta, type PerkRow, type PerkType } from "./perk-types";

function Row({
  perk,
  href,
  current,
  isDefault,
  draggable,
  onDragEnd,
}: {
  perk: PerkRow;
  href: string;
  current: boolean;
  isDefault: boolean;
  draggable: boolean;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  const inner = (
    <>
      {draggable && (
        <button type="button" className="grip" aria-label={`Drag ${perk.name} to reorder`} onPointerDown={(e) => controls.start(e)}>
          <Icon name="grip" size={20} />
        </button>
      )}
      <PerkTile perk={perk} />
      <Link className="body" href={href} scroll={false} aria-current={current ? "true" : undefined}>
        <span className="t">{perk.name}</span>
        <span className="m">{perkMeta(perk)}</span>
      </Link>
      <span className="end">{perk.badge ? <Pill kind="ink">{perk.badge}</Pill> : null}</span>
    </>
  );
  const cls = `ad-prow${draggable ? "" : " no-grip"}`;
  if (!draggable) {
    return (
      <div className={cls} data-current={current ? "true" : undefined} data-default={isDefault ? "true" : undefined}>
        {inner}
      </div>
    );
  }
  return (
    <Reorder.Item
      as="div"
      value={perk}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className={cls}
      data-current={current ? "true" : undefined}
      data-default={isDefault ? "true" : undefined}
    >
      {inner}
    </Reorder.Item>
  );
}

export function PerksList({ type, rows }: { type: PerkType; rows: PerkRow[] }) {
  const router = useRouter();
  const words = PERK_WORDS[type];
  const { params, update } = useListParams();
  const openId = useOpenId();
  const asked = Math.max(PAGE_SIZE, Number(params.get("show")) || PAGE_SIZE);
  const [q, setQ] = useSearchState(params.get("q") ?? "", (value) => update({ q: value || null, show: null }));
  const [items, setItems] = useState(rows);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (rowsRef.current !== rows) {
      rowsRef.current = rows;
      setItems(rows);
    }
  }, [rows]);

  const needle = norm(q);
  const hits = needle
    ? items.filter((p) => norm(p.name).includes(needle) || norm(p.area).includes(needle) || norm(p.category ?? "").includes(needle))
    : items;
  const show = rowsToShow(hits, asked, openId);
  const visible = hits.slice(0, show);
  const draggable = !needle && visible.length > 1;
  // The card beside the list on the index page is the first one for the search the page opened with.
  const [openedWith] = useState(() => params.get("q") ?? "");
  const first = openedWith === q ? (visible[0]?.id ?? null) : null;
  const kept = new URLSearchParams();
  if (q) kept.set("q", q);
  if (params.get("show")) kept.set("show", String(show));
  const keep = kept.toString() ? `?${kept.toString()}` : "";

  function onReorder(next: PerkRow[]) {
    // The rows shown are the first ones of the whole list; the rest keep their places after them.
    setItems((all) => [...next, ...all.slice(next.length)]);
  }

  async function onDragEnd() {
    const ids = itemsRef.current.map((p) => p.id);
    if (ids.join() === rowsRef.current.map((p) => p.id).join()) return;
    setError(null);
    const result = await reorderPerks(type, ids).catch(() => ({ success: false, error: "We couldn’t save that order. Try again in a moment." }));
    if (!result.success) {
      setError(result.error ?? "We couldn’t save that order. Try again in a moment.");
      setItems(rowsRef.current);
      return;
    }
    router.refresh();
  }

  const list = visible.map((p) => (
    <Row
      key={p.id}
      perk={p}
      href={`${words.base}/${p.id}${keep}`}
      current={p.id === openId}
      isDefault={!openId && p.id === first}
      draggable={draggable}
      onDragEnd={onDragEnd}
    />
  ));

  return (
    <div>
      <div className="ad-tools">
        <SearchBox value={q} onChange={setQ} placeholder={type === "discount" ? "Search by name, area or category" : "Search by name or area"} label={`Search ${words.many}`} />
        <p className="ad-hint" style={{ margin: 0 }}>
          {draggable ? "Drag a row by its handle to reorder. Members see them in this order." : needle ? "Clear the search to change the order." : "Members see them in this order."}
        </p>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {visible.length === 0 ? (
        <div className="ad-q">
          <div className="ad-nomatch" role="status">
            {needle ? (
              <>
                <b>Nothing matches “{q.trim()}”.</b>
                <p>Check the spelling, or try the area.</p>
              </>
            ) : (
              <>
                <b>No {words.many} yet.</b>
                <p>Add one and members see it straight away.</p>
              </>
            )}
          </div>
        </div>
      ) : draggable ? (
        <Reorder.Group as="div" axis="y" values={visible} onReorder={onReorder} className="ad-q">
          {list}
        </Reorder.Group>
      ) : (
        <div className="ad-q">{list}</div>
      )}
      {needle && visible.length > 0 && hits.length <= show ? (
        <div className="ad-more" aria-live="polite">
          <span>
            {hits.length} of {items.length} match
          </span>
        </div>
      ) : (
        <MoreLine
          shown={visible.length}
          total={hits.length}
          onMore={() => update({ show: String(show + PAGE_SIZE) })}
          summary={`${items.length} ${items.length === 1 ? words.one : words.many}, in the order members see them`}
        />
      )}
    </div>
  );
}
