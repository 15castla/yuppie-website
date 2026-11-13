// Nominations and Club Yuppie credit (Albert, 11 to 12 Nov 2026), as the members pages see them. Pure data: the
// server (lib/server/nominations.ts, lib/server/credit.ts) builds these for one member; the views
// (components/members/nominate) draw them, and the preview harness draws them from example data.

/** £10 to the nominator for each nominee the committee approves. */
export const NOMINATION_CREDIT_PENCE = 1000;
/** How many applications may come with one member's link or code, whatever the committee decides. */
export const NOMINATIONS_DEFAULT = 5;

/** applied: with the committee; approved: in, and the credit added; used: not accepted (never said in those words). */
export type NominationStatus = "applied" | "approved" | "used";

export type NominationRow = {
  id: string;
  /** The applicant's first name. */
  firstName: string;
  status: NominationStatus;
  /** "12 Nov": when they applied. */
  at: string;
};

export type CreditRow = {
  id: string;
  /** + added, - spent. */
  amountPence: number;
  /** "Ann's nomination", "Wine night", "From Club Yuppie". */
  label: string;
  /** "12 Nov". */
  at: string;
};

/** The card on You. */
export type NominateCardData = {
  allowed: number;
  used: number;
  creditPence: number;
};

/** The Nominate page. */
export type NominatePageData = NominateCardData & {
  /** "ALBERT-7K2Q". */
  code: string;
  /** "https://clubyuppie.com/apply/albert-7k2q". */
  link: string;
  /** What Share sends with the link. */
  shareText: string;
  /** Newest first. */
  nominations: NominationRow[];
  /** Newest first. */
  history: CreditRow[];
};

export const nominationsLeft = (d: Pick<NominateCardData, "allowed" | "used">) => Math.max(0, d.allowed - d.used);
