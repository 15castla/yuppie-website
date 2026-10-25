// What the Discounts and Access pages know about a partner perk, in one place:
// how a category reads, which chips exist, how Access groups by kind, the
// "5 offers" count and the mail links. Pure functions of the data the real
// `partner_perks` table gives (components/members/mock-perks.ts is the type),
// so the views stay presentational and the preview harness can feed them.

import type { IconName } from "@/components/members/kit/icons";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { CONTACT_EMAIL } from "@/components/site/links";

export type AccessKind = NonNullable<PartnerPerk["access_kind"]>;

// The kinds the database allows (the partner_perks check constraint), in the
// fixed order the page shows them. A kind with nothing in it has no section.
// The icon is the tile of every row in the section (Access perks have no logo).
export const ACCESS_KINDS: { kind: AccessKind; label: string; icon: IconName }[] = [
  { kind: "skip_queue", label: "Skip the queue", icon: "zap" },
  { kind: "members_club", label: "Members’ clubs", icon: "building" },
  { kind: "first_dibs", label: "First dibs", icon: "sparkle" },
  { kind: "invite_only", label: "Invite only", icon: "lock" },
];

export function accessKindLabel(kind: PartnerPerk["access_kind"]): string {
  return ACCESS_KINDS.find((entry) => entry.kind === kind)?.label ?? "Access";
}

export function accessKindIcon(kind: PartnerPerk["access_kind"]): IconName {
  return ACCESS_KINDS.find((entry) => entry.kind === kind)?.icon ?? "lock";
}

// Access perks grouped by kind, in the page's order, empty kinds left out.
// A perk with no kind (the database allows it for a perk saved as access
// without one) would otherwise appear nowhere, so it joins the last section.
export function groupAccessByKind<T extends Pick<PartnerPerk, "access_kind">>(perks: T[]) {
  const known = new Set<string>(ACCESS_KINDS.map((entry) => entry.kind));
  const groups = ACCESS_KINDS.map((entry) => ({
    ...entry,
    perks: perks.filter((perk) =>
      perk.access_kind === entry.kind ||
      (entry.kind === "invite_only" && (!perk.access_kind || !known.has(perk.access_kind))),
    ),
  }));
  return groups.filter((group) => group.perks.length > 0);
}

// Categories are free text typed by the admin ("Food & Drink" was the first
// one). The house style is sentence case and "and", so "Food & Drink" reads
// "Food and drink" and "Beauty, Hair and Skincare" reads "Beauty, hair and
// skincare". A word with a capital inside it, or in capitals ("BMW"), is left
// alone. Null for a perk with no category.
export function displayCategory(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text
    .split(" ")
    .map((word, index) => {
      if (index === 0) return word;
      const match = /^([A-Z])([a-z]+)([,;:.]?)$/.exec(word);
      return match ? `${match[1].toLowerCase()}${match[2]}${match[3]}` : word;
    })
    .join(" ");
}

// The categories the club began with, in the order its chips always had.
// Anything an admin adds follows, in the order the perks come.
const BASELINE_CATEGORIES = ["Food and drink", "Fitness", "Grooming", "Wellness"];

// Chips come from the categories that exist, so there is never a chip with
// nothing behind it. Fewer than two categories: no chips (nothing to filter).
export function categoryChips(perks: Pick<PartnerPerk, "category">[]): string[] {
  const found: string[] = [];
  for (const perk of perks) {
    const label = displayCategory(perk.category);
    if (label && !found.includes(label)) found.push(label);
  }
  const known = BASELINE_CATEGORIES.filter((label) => found.includes(label));
  const added = found.filter((label) => !BASELINE_CATEGORIES.includes(label));
  const chips = [...known, ...added];
  return chips.length >= 2 ? chips : [];
}

// The perk the member is showing on the redeem card, as the card prints it.
// `meta` is the line under the name: "Food and drink · Northgate" for a
// discount, "Skip the queue · Marlow" for access.
export type RedeemPerk = {
  name: string;
  headline: string;
  meta: string;
  badge: string | null;
};

export function redeemPerkFor(perk: PartnerPerk): RedeemPerk {
  return {
    name: perk.name,
    headline: perk.headline,
    meta: perk.type === "access" ? accessMeta(perk) : discountMeta(perk),
    badge: perk.badge,
  };
}

// "Food and drink · Northgate". A discount row and the redeem card print this.
export function discountMeta(perk: Pick<PartnerPerk, "category" | "area">): string {
  return [displayCategory(perk.category), perk.area].filter(Boolean).join(" · ");
}

// "Members’ clubs · Northgate". An Access row prints the area alone (its kind
// is the section it sits in); the spotlight card and the redeem card print both.
export function accessMeta(perk: Pick<PartnerPerk, "access_kind" | "area">): string {
  return [accessKindLabel(perk.access_kind), perk.area].filter(Boolean).join(" · ");
}

export function offerCount(count: number): string {
  return `${count} offer${count === 1 ? "" : "s"}`;
}

// The two mail links: "Suggest a place" (the closing band) and "Get in touch"
// (the redeem card for a membership that cannot show a card). Opened by the
// mail app. The subject says Club Yuppie in full.
export function mailHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const SUGGEST_PLACE_HREF = mailHref("Suggest a place for Club Yuppie");
export const SUGGEST_DOOR_HREF = mailHref("Suggest a door for Club Yuppie");
export const REJOIN_HREF = mailHref("Rejoining Club Yuppie");
export const CARD_HELP_HREF = mailHref("My Club Yuppie card");

// ---- the spotlight card, when the admin features an event ---------------------------------------------------------

const EVENT_ZONE = "Europe/London";

// "Fri 30 Oct, 19:00": weekday, day, month, then the 24-hour time with its
// leading zero, in the club's time zone (the zone every event time is in).
export function eventWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: EVENT_ZONE,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}

// "Included" for a free event, else the price the events list prints ("£25pp").
export function eventBadge(pricePence: number): string {
  if (!pricePence) return "Included";
  return `£${(pricePence / 100).toFixed(pricePence % 100 === 0 ? 0 : 2)}pp`;
}

// One line about the event: the first sentence of its description, or null.
export function firstSentence(text: string | null | undefined): string | null {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const end = /[.!?](\s|$)/.exec(flat);
  const sentence = end ? flat.slice(0, end.index + 1) : flat;
  return sentence.slice(0, 240);
}
