// Nominate a friend's card (12 Nov 2026): on You only (Albert, 12 Nov: "only be able to nominate through the
// profile"), and says the deal every time it is seen: "£10 credit for you each time one is approved." Opens the
// Nominate page.
// A view of plain props (the preview harness draws it).

import "./nominate.css";

import { Icon, KitLink } from "@/components/members/kit";
import { NOMINATION_CREDIT_PENCE, nominationsLeft, type NominateCardData } from "@/lib/members/nominate/types";
import { ROUTES } from "@/lib/members/routes";
import { gbp } from "./money";

/** "3 of 5 left · £20 credit", "All 5 used", "5 left". */
export function nominateMeta(data: NominateCardData): string {
  const left = nominationsLeft(data);
  const count = left === 0 ? `All ${data.allowed} used` : left === data.allowed ? `${left} left` : `${left} of ${data.allowed} left`;
  return data.creditPence > 0 ? `${count} · ${gbp(data.creditPence)} credit` : count;
}

export function NominateCard({ data, className }: { data: NominateCardData; className?: string }) {
  return (
    <KitLink href={ROUTES.youNominate} className={`mk-card mk-yellow nm-card${className ? ` ${className}` : ""}`}>
      <span className="nm-card-ico" aria-hidden="true">
        <Icon name="gift" size={24} />
      </span>
      <span className="nm-card-body">
        <span className="nm-card-title">Nominate a friend</span>
        <span className="nm-card-line">{gbp(NOMINATION_CREDIT_PENCE)} credit for you each time one is approved.</span>
        <span className="nm-card-meta">{nominateMeta(data)}</span>
      </span>
      <Icon name="chevron-right" size={22} />
    </KitLink>
  );
}
