"use client";

// Access (/members/access), rebuilt on the members kit from the approved
// design (v3 specs/discounts-access.md, section B). A pure component of props
// (the page fetches and resolves the feature card), so the preview harness can
// draw it.
//
// Title block, one line on how it works, the spotlight card (optional: the
// admin's feature card, with the public drawing for its type standing on it),
// then sections by kind in a fixed order (Skip the queue, Members’ clubs, First
// dibs, Invite only), each hidden when empty, then a closing line with a mail
// link. The grouping reads `access_kind`, a real column of `partner_perks`.

import { useState } from "react";

import {
  Button,
  Card,
  ClosingBand,
  EmptyState,
  Icon,
  Main,
  PerkDrawing,
  Pill,
  SectionHead,
  TitleBlock,
  type PerkDrawingName,
} from "@/components/members/kit";
import { PartnerList, PartnerRow } from "@/components/members/discounts/partner-row";
import { ACCESS_TITLE } from "@/components/members/discounts/loading-views";
import {
  SUGGEST_DOOR_HREF,
  accessMeta,
  discountMeta,
  groupAccessByKind,
  redeemPerkFor,
} from "@/components/members/discounts/perk-model";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { RedeemCard } from "@/components/members/RedeemCard";
import { ROUTES, eventHref } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import "@/components/members/discounts/discounts.css";

// featureCard is whichever single event, discount, or access perk is
// currently spotlighted (set from the single dropdown on /admin/access,
// see app/admin/feature-card-actions.ts's setFeatureCard), resolved by
// app/members/access/page.tsx into this discriminated union rather than
// a flat title/subtitle shape, so tapping the card can do the right
// thing for whichever kind of content it is: open the event page, or
// open the redemption modal for the perk. Null when nothing is
// currently featured, in which case the card is hidden entirely (and so is
// its drawing, and no gap is left) rather than showing stale or placeholder copy.
export type ResolvedFeatureCard =
  | {
      kind: "event";
      slug: string;
      title: string;
      /** "Fri 30 Oct, 19:00 · The Mews Terrace" */
      meta: string;
      /** One line about the event (the first sentence of its description), when it has one. */
      line: string | null;
      /** "Included", or the price. */
      badge: string | null;
      label: string;
    }
  | { kind: "perk"; perk: PartnerPerk; label: string };

function Spotlight({
  card,
  onOpenPerk,
}: {
  card: ResolvedFeatureCard;
  onOpenPerk: (perk: PartnerPerk) => void;
}) {
  const isEvent = card.kind === "event";
  const perk = card.kind === "perk" ? card.perk : null;
  // The public drawing for the type: coupes for an event, the tag for a discount, the rope for access.
  const drawing: PerkDrawingName = isEvent ? "coupes" : perk?.type === "discount" ? "tag" : "rope";
  const name = isEvent ? card.title : perk!.name;
  const meta = isEvent ? card.meta : perk!.type === "discount" ? discountMeta(perk!) : accessMeta(perk!);
  const line = isEvent ? card.line : perk!.headline;
  const badge = isEvent ? card.badge : perk!.badge;

  return (
    <div className="dc-spot-wrap">
      <div className="mk-art dc-spot-stand" aria-hidden="true">
        <PerkDrawing name={drawing} />
      </div>
      <Card as="article" className="dc-spot" aria-label={card.label}>
        <div className="dc-spot-top">
          <Pill kind="ink">{card.label}</Pill>
          {badge ? <Pill kind={isEvent ? "outline" : "ink"}>{badge}</Pill> : null}
        </div>
        <h2 className="dc-spot-h">{name}</h2>
        <p className="dc-spot-meta">{meta}</p>
        {line ? <p className={cn("dc-spot-line", isEvent && "dc-clamp")}>{line}</p> : null}
        {card.kind === "event" ? (
          <Button href={eventHref(card.slug)} size="sm">
            See event
          </Button>
        ) : (
          <Button size="sm" onClick={() => onOpenPerk(card.perk)}>
            Show my card
          </Button>
        )}
      </Card>
    </div>
  );
}

export function AccessView({
  perks,
  featureCard,
}: {
  perks: PartnerPerk[];
  featureCard: ResolvedFeatureCard | null;
}) {
  const [selected, setSelected] = useState<PartnerPerk | null>(null);
  const groups = groupAccessByKind(perks);

  // Nothing at all (no doors and no spotlight): the title stays, the how-it-works line goes, the honest band.
  if (groups.length === 0 && !featureCard) {
    return (
      <Main fill className="dc-main">
        <TitleBlock title={ACCESS_TITLE.title} sub={ACCESS_TITLE.sub} />
        <div className="dc-gap" />
        <EmptyState
          label="No access yet"
          title="Nothing here"
          accent="yet."
          lead="We’re lining up the first doors. They’ll appear here."
          action={
            <Button href={ROUTES.events} blockPhone>
              See events
            </Button>
          }
          drawing="rope"
        />
      </Main>
    );
  }

  return (
    <>
      <Main fill className="dc-main">
        <div className="mk-wrap">
          <div className={cn("dc-acc-top", featureCard && "dc-has-spot")}>
            <div className="dc-acc-head">
              <TitleBlock {...ACCESS_TITLE} />
            </div>
            {featureCard ? (
              <div className="dc-acc-spot">
                <Spotlight card={featureCard} onOpenPerk={setSelected} />
              </div>
            ) : null}
          </div>
        </div>

        {groups.length > 0 ? (
          <div className="mk-wrap">
            <div className="dc-ksecs">
              {groups.map((group) => (
                <section key={group.kind} className="dc-ksec" aria-label={group.label}>
                  <SectionHead title={group.label} />
                  <PartnerList>
                    {group.perks.map((perk) => (
                      <PartnerRow
                        key={perk.id}
                        name={perk.name}
                        offer={perk.headline}
                        meta={perk.area}
                        badge={perk.badge}
                        icon={<Icon name={group.icon} size={24} />}
                        onOpen={() => setSelected(perk)}
                      />
                    ))}
                  </PartnerList>
                </section>
              ))}
            </div>
          </div>
        ) : null}

        <ClosingBand
          label="Suggest a place"
          title="Know a door we should try?"
          accent="Tell us."
          lead="Send us a name and we’ll see if they’ll have us."
          action={
            <Button href={SUGGEST_DOOR_HREF} blockPhone>
              Suggest a place
            </Button>
          }
          drawing="rope"
        />
      </Main>

      {selected ? <RedeemCard perk={redeemPerkFor(selected)} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
