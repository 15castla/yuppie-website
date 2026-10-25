"use client";

// Discounts (/members/discounts), rebuilt on the members kit from the approved
// design (v3 specs/discounts-access.md, section A). A pure component of props
// (the page fetches), so the preview harness can draw it.
//
// Title block, one line on how it works, category chips, a heading that
// follows the chip with a count, a ruled row per partner, a closing line with
// a mail link. Tapping a row opens the redeem card. Chips come from the
// categories that exist; with fewer than two there are none.

import { useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Chip,
  ChipRow,
  ClosingBand,
  EmptyState,
  Main,
  SectionHead,
  TitleBlock,
} from "@/components/members/kit";
import { PartnerList, PartnerRow } from "@/components/members/discounts/partner-row";
import { DISCOUNTS_TITLE } from "@/components/members/discounts/loading-views";
import {
  SUGGEST_PLACE_HREF,
  categoryChips,
  discountMeta,
  displayCategory,
  offerCount,
  redeemPerkFor,
} from "@/components/members/discounts/perk-model";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { RedeemCard } from "@/components/members/RedeemCard";
import { ROUTES } from "@/lib/members/routes";
import "@/components/members/discounts/discounts.css";

// The chosen chip stays in view: when the chip row scrolls sideways (a phone)
// it scrolls so the chosen chip is whole, with 20px to spare, on load and on every tap.
// On load it runs again once the web fonts are in, because the chips change width then.
function useKeepChosenChipInView(active: string | null) {
  const wrap = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    function reveal(instant: boolean) {
      const row = wrap.current?.querySelector<HTMLElement>(".mk-chips");
      const chip = row?.querySelector<HTMLElement>(".mk-is-active");
      if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
      const margin = 20;
      const left = chip.offsetLeft;
      const right = left + chip.offsetWidth;
      let target = row.scrollLeft;
      if (left - margin < row.scrollLeft) target = Math.max(0, left - margin);
      else if (right + margin > row.scrollLeft + row.clientWidth) target = right + margin - row.clientWidth;
      if (target !== row.scrollLeft) row.scrollTo({ left: target, behavior: instant ? "auto" : "smooth" });
    }
    const onLoad = firstRun.current;
    firstRun.current = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reveal(onLoad || reduced);
    if (onLoad) void document.fonts?.ready.then(() => reveal(true));
  }, [active]);
  return wrap;
}

export function DiscountsView({
  perks,
  categories,
  initialCategory = null,
}: {
  perks: PartnerPerk[];
  /** The chips (display names). Omitted: taken from the categories the perks have. Passed by the preview harness only. */
  categories?: string[];
  /** The chosen chip to start on. Omitted: All. */
  initialCategory?: string | null;
}) {
  const chips = useMemo(() => categories ?? categoryChips(perks), [categories, perks]);
  const [chosen, setChosen] = useState<string | null>(initialCategory);
  // A chip that no longer exists (the list changed under it) is the same as All.
  const active = chosen && chips.includes(chosen) ? chosen : null;
  const chipsWrap = useKeepChosenChipInView(active);

  const shown = useMemo(
    () => (active ? perks.filter((perk) => displayCategory(perk.category) === active) : perks),
    [perks, active],
  );

  const [selected, setSelected] = useState<PartnerPerk | null>(null);

  const heading = (
    <TitleBlock
      title={DISCOUNTS_TITLE.title}
      sub={DISCOUNTS_TITLE.sub}
      // Nothing to tap yet: no how-it-works line.
      lead={perks.length > 0 ? DISCOUNTS_TITLE.lead : undefined}
    />
  );

  // No offers at all: no chips, no lead, the honest band.
  if (perks.length === 0) {
    return (
      <Main fill className="dc-main">
        {heading}
        <div className="dc-gap" />
        <EmptyState
          label="No offers"
          title="No offers"
          accent="yet."
          lead="We’re lining up the first partners. They’ll appear here."
          action={
            <Button href={ROUTES.events} blockPhone>
              See events
            </Button>
          }
          drawing="tag"
        />
      </Main>
    );
  }

  return (
    <>
      <Main fill className="dc-main">
        {heading}

        {chips.length > 0 ? (
          <div className="mk-wrap">
            <div className="dc-chips" ref={chipsWrap}>
              <ChipRow label="Filter by category">
                <Chip active={active === null} onClick={() => setChosen(null)}>
                  All
                </Chip>
                {chips.map((label) => (
                  <Chip key={label} active={active === label} onClick={() => setChosen(label)}>
                    {label}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          </div>
        ) : null}

        {shown.length === 0 ? (
          // A chosen chip with nothing behind it. Chips come from the categories
          // that exist, so this is the safety net, not a state members meet.
          <>
            <div className="dc-gap" />
            <EmptyState
              label="No offers in this category"
              title="Nothing here"
              accent="yet."
              lead={`No offers in ${active}. Try another filter, or see them all.`}
              action={
                <Button blockPhone onClick={() => setChosen(null)}>
                  Show all offers
                </Button>
              }
              drawing="tag"
            />
          </>
        ) : (
          <>
            <div className="mk-wrap">
              <section className="dc-sec" aria-label="Offers">
                <SectionHead title={active ?? "All offers"} meta={offerCount(shown.length)} />
                <PartnerList>
                  {shown.map((perk) => (
                    <PartnerRow
                      key={perk.id}
                      name={perk.name}
                      offer={perk.headline}
                      meta={discountMeta(perk)}
                      badge={perk.badge}
                      logoUrl={perk.logo_url}
                      onOpen={() => setSelected(perk)}
                    />
                  ))}
                </PartnerList>
              </section>
            </div>
            <ClosingBand
              label="Suggest a place"
              title="Know a place we should add?"
              accent="Tell us."
              lead="Send us a name and we’ll ask them."
              action={
                <Button href={SUGGEST_PLACE_HREF} blockPhone>
                  Suggest a place
                </Button>
              }
              drawing="tag"
            />
          </>
        )}
      </Main>

      {selected ? <RedeemCard perk={redeemPerkFor(selected)} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
