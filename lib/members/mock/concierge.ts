// EXAMPLE DATA: invented people and places, never shown to real members (flag off, 404 in production)
//
// The Concierge's fake adapter: what the screen shows while no backend exists.
// It returns exactly the types in lib/members/concierge/types.ts. The places
// below are made up (the first two are the approved design's own). The rule
// the copy follows: the concierge recommends and never books, so no card has a
// time or a table size, and advice tells the member to ring ahead themselves.

import type {
  ConciergeMemoryItem,
  ConciergeMessage,
  ConciergeRecommendation,
  ConciergeScript,
  ConciergeSnapshot,
} from "@/lib/members/concierge/types";

function mapsUrl(name: string, address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(`${name}, ${address}`)}`;
}

function place(
  id: string,
  name: string,
  why: string,
  facts: [string, string],
  address: string,
): ConciergeRecommendation {
  return { id, name, why, facts, address, mapsUrl: mapsUrl(name, address) };
}

// ---------------------------------------------------------------- places

export const CALDER = place(
  "example-calder",
  "Calder & Co",
  "Candlelit, big round tables, easy to talk. Walk-ins go early, so ring ahead.",
  ["Good for four", "Candlelit"],
  "14 Mill Street",
);

export const CELLAR = place(
  "example-cellar",
  "The Marlow Cellar",
  "Wine list you can ask about, quieter upstairs.",
  ["Quiet upstairs", "Wine list"],
  "2 Brewery Lane",
);

const NET_POST = place(
  "example-net-post",
  "The Net Post",
  "Ten minutes on foot from the courts, with a long bar and plenty of standing room.",
  ["Open late", "Near the courts"],
  "1 Court Row",
);

const TOLLIVER = place(
  "example-tolliver",
  "Tolliver’s Kitchen",
  "Big plates to share, and nobody minds a sweaty team shirt.",
  ["Plates to share", "Walk-ins welcome"],
  "22 Northgate Road",
);

const ORCHARD = place(
  "example-orchard",
  "The Orchard House",
  "A proper roast under apple trees. The walk from the station is half the point.",
  ["Garden", "Sunday roast"],
  "Hill Lane",
);

const LINDEN = place(
  "example-linden",
  "The Linden Yard",
  "A walled garden with heaters, so it works even when the sun doesn’t.",
  ["Walled garden", "Heaters outside"],
  "9 Linden Row",
);

const PEAR_TREE = place(
  "example-pear-tree",
  "Pear Tree Inn",
  "A big lawn at the back, and a kitchen that takes Sunday lunch seriously.",
  ["Big garden", "Dog friendly"],
  "Calder Park Gate",
);

// ---------------------------------------------------------------- the screen's own copy

/** The three tiles under "Try asking". */
export const EXAMPLE_SUGGESTIONS: string[] = [
  "Somewhere for supper on Thursday, four of us, nothing too loud.",
  "Where should we go after Padel & Pints?",
  "A Sunday lunch worth the walk, somewhere with a garden.",
];

/** What the concierge has learned about the example member (the memory sheet). */
export const EXAMPLE_MEMORY: ConciergeMemoryItem[] = [
  { id: "example-mem-quiet", text: "Likes quiet places" },
  { id: "example-mem-four", text: "Usually books for four" },
  { id: "example-mem-veg", text: "Vegetarian options" },
  { id: "example-mem-thu", text: "Prefers Thursdays" },
];

export const EXAMPLE_FIRST_QUESTION = EXAMPLE_SUGGESTIONS[0];
export const EXAMPLE_FIRST_REPLY = "Two good ones for Thursday, both with round tables so four can talk easily.";

/** A conversation that has one question and a reply with two places (the approved "Conversation" frame). */
export const EXAMPLE_CONVERSATION: ConciergeMessage[] = [
  { role: "member", id: "example-m1", at: "09:41", text: EXAMPLE_FIRST_QUESTION, status: "sent" },
  {
    role: "concierge",
    id: "example-r1",
    at: "09:41",
    text: EXAMPLE_FIRST_REPLY,
    recommendations: [CALDER, CELLAR],
  },
];

/** The long reply of the design: advice in numbered steps, then an offer of another place to recommend. */
export const EXAMPLE_LONG_QUESTION = "Birthday dinner for eight, Saturday 7 Nov. One vegetarian, one who hates noise.";
export const EXAMPLE_LONG_REPLY: ConciergeMessage = {
  role: "concierge",
  id: "example-r-long",
  at: "09:52",
  text: "Eight on a Saturday needs a booking, not a walk-in. Here’s how I’d go about it.",
  steps: [
    "Ring Calder & Co and ask for the round table at the back. It seats eight and it’s the quietest spot in the room.",
    "Ask for 19:00, not 20:00. The kitchen is calmer and you’ll hear each other through the starters.",
    "Tell them about the vegetarian when you ring. The set menu changes on Fridays.",
  ],
  closing: "Want a second option in case they’re full?",
  remembered: { id: "example-mem-eight", text: "Books for eight on Saturdays" },
};

// ---------------------------------------------------------------- the adapter

/**
 * Canned replies for the screen to answer from. A reply with a `prompt`
 * answers exactly that question (the three tiles); the ones without are used
 * in turn for anything else the member types.
 */
const SCRIPT: ConciergeScript = {
  replies: [
    {
      prompt: EXAMPLE_SUGGESTIONS[0],
      reply: { id: "script-supper", text: EXAMPLE_FIRST_REPLY, recommendations: [CALDER, CELLAR] },
    },
    {
      prompt: EXAMPLE_SUGGESTIONS[1],
      reply: {
        id: "script-padel",
        text: "Two close to the courts, both easy to get to on foot.",
        recommendations: [NET_POST, TOLLIVER],
      },
    },
    {
      prompt: EXAMPLE_SUGGESTIONS[2],
      reply: {
        id: "script-sunday",
        text: "Two with proper gardens, both worth the walk.",
        recommendations: [ORCHARD, PEAR_TREE],
      },
    },
    {
      prompt: null,
      reply: {
        id: "script-garden",
        text: "A garden it is. These two both have one, and both are good when it’s cool out.",
        recommendations: [LINDEN, PEAR_TREE],
        remembered: { id: "example-mem-garden", text: "Likes a garden" },
      },
    },
    {
      prompt: null,
      reply: {
        id: "script-ask",
        text: "Happy to look again. Tell me the area, the night and roughly how many of you, and I’ll find a few places.",
      },
    },
  ],
};

export function getConciergeScript(): ConciergeScript {
  return SCRIPT;
}

/** First open: no conversation, nothing remembered yet, three suggestions. */
export async function getConciergeSnapshot(): Promise<ConciergeSnapshot> {
  return { messages: [], memory: [], suggestions: EXAMPLE_SUGGESTIONS };
}
