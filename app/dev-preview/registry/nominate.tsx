// Preview screens for Nominate a friend (12 Nov 2026). Ids: nominate-page.
//
// EXAMPLE CONTENT: the names, dates, code and amounts below are made up; nothing is read or written.

import { NominateView } from "@/components/members/nominate/nominate-view";
import type { NominatePageData } from "@/lib/members/nominate/types";
import type { PreviewScreen } from "./types";

const LINK = "https://clubyuppie.com/apply/sam-7k2q";

const BASE: NominatePageData = {
  allowed: 5,
  used: 0,
  creditPence: 0,
  code: "SAM-7K2Q",
  link: LINK,
  shareText: "I’d like to nominate you for Club Yuppie. Apply with my link and the committee will know I put you forward. Or use my code, SAM-7K2Q.",
  nominations: [],
  history: [],
};

const SOME: NominatePageData = {
  ...BASE,
  used: 3,
  creditPence: 1000,
  nominations: [
    { id: "n3", firstName: "Ben", status: "applied", at: "11 Nov" },
    { id: "n2", firstName: "Ann", status: "approved", at: "4 Nov" },
    { id: "n1", firstName: "Cara", status: "used", at: "28 Oct" },
  ],
  history: [{ id: "h1", amountPence: 1000, label: "Ann’s nomination", at: "6 Nov" }],
};

const ALL_USED: NominatePageData = {
  ...BASE,
  used: 5,
  creditPence: 1500,
  nominations: [
    { id: "n5", firstName: "Eve", status: "applied", at: "12 Nov" },
    { id: "n4", firstName: "Dan", status: "approved", at: "9 Nov" },
    { id: "n3", firstName: "Ben", status: "approved", at: "5 Nov" },
    { id: "n2", firstName: "Ann", status: "approved", at: "4 Nov" },
    { id: "n1", firstName: "Cara", status: "used", at: "28 Oct" },
  ],
  history: [
    { id: "h4", amountPence: -1500, label: "Wine tasting at The Mews", at: "11 Nov" },
    { id: "h3", amountPence: 1000, label: "Dan’s nomination", at: "10 Nov" },
    { id: "h2", amountPence: 1000, label: "Ben’s nomination", at: "7 Nov" },
    { id: "h1", amountPence: 1000, label: "Ann’s nomination", at: "6 Nov" },
  ],
};

const STATES = ["some", "start", "all-used", "copied"] as const;

export const nominateScreens: PreviewScreen[] = [
  {
    id: "nominate-page",
    title: "Nominate a friend",
    states: STATES,
    tab: null,
    youCurrent: true,
    defaultFlags: ["openInvite", "concierge", "nominations"],
    render: ({ state }) => {
      switch (state) {
        case "start":
          return <NominateView data={BASE} demoShare />;
        case "all-used":
          return <NominateView data={ALL_USED} />;
        case "copied":
          return <NominateView data={SOME} demoCopied="link" />;
        default:
          return <NominateView data={SOME} demoShare />;
      }
    },
  },
];
