// The Concierge, as a backend has to supply it. No backend exists yet: the
// screen runs on the example-data adapter (lib/members/mock/concierge.ts), is
// switched off by flags.concierge, and 404s in production unless MEMBERS_SHOW_EXAMPLES=on (assertMockAllowed).
// This file is the build spec for the real one: every type below is what the
// screen needs, nothing more.
//
// The rule that shapes all of it (Albert, 25 Oct 2026): THE CONCIERGE
// RECOMMENDS AND NEVER BOOKS. A recommendation has no time slot, no party size
// and no "book" action; it is a place, a reason, two facts and where it is.
// Advice inside a reply may tell the member to book themselves ("Ring ahead")
// but must never offer to do it for them. It is an AI, with no name, no photo
// and no "she" or "he": the screen says "AI concierge" once.
//
// App only (the web has no Concierge page).

/** A place the concierge recommends. */
export type ConciergeRecommendation = {
  id: string;
  /** "Calder & Co" */
  name: string;
  /** One sentence on why it fits what the member asked for. */
  why: string;
  /**
   * Up to two short facts about the place, drawn as pills: "Good for four",
   * "Quiet upstairs", "Garden". Never a time or a table size: the member
   * books, so the concierge does not offer slots.
   */
  facts: string[];
  /** "14 Mill Street" */
  address: string;
  /** Opens the place in the phone's maps app (the "Open in Maps" link). */
  mapsUrl: string;
};

/**
 * A page the concierge relied on, shown under its reply ("Sources: timeout.com"). Anthropic's terms ask for the
 * sources of web search results to be shown to the people who see them. Added 1 Nov 2026 for the real backend.
 */
export type ConciergeSource = {
  /** The site's name as it reads in the link: "timeout.com". */
  label: string;
  url: string;
};

/** One thing the concierge has learned about the member's taste. */
export type ConciergeMemoryItem = {
  id: string;
  /**
   * Short, in plain words: "Likes quiet places". It starts with a common word,
   * never a name, because the "Remembered" chip lowercases the first letter
   * ("Remembered: likes quiet places.").
   */
  text: string;
};

/** What the concierge says back. */
export type ConciergeReply = {
  id: string;
  /** The time it was sent, 24-hour with a leading zero: "09:52". */
  at: string;
  /** The first paragraph. Plain text. */
  text: string;
  /**
   * Numbered advice for a longer reply. Advice to the member in the
   * imperative ("Ring ahead", "Ask for the round table"): the member books,
   * the concierge never says "I'll book".
   */
  steps?: string[];
  /** A closing line after the steps, such as an offer of another place to recommend. */
  closing?: string;
  /** Places to show as cards under the bubble. */
  recommendations?: ConciergeRecommendation[];
  /** The pages its places came from, drawn small under the cards. */
  sources?: ConciergeSource[];
  /**
   * What it learned from this exchange: drawn as a chip under the reply
   * ("Remembered: …") with Undo, which forgets this one item. The item is
   * already saved when the reply arrives.
   */
  remembered?: ConciergeMemoryItem;
};

/** What the member said. */
export type ConciergeMemberMessage = {
  id: string;
  at: string;
  text: string;
  /**
   * sent: delivered (a reply follows, or is on its way).
   * pending: waiting for the reply ("Looking for places…").
   * failed: not sent, no connection ("Try again" sends the same text).
   */
  status: "sent" | "pending" | "failed";
};

export type ConciergeMessage =
  | ({ role: "member" } & ConciergeMemberMessage)
  | ({ role: "concierge" } & ConciergeReply);

/** Everything the screen needs when it opens. */
export type ConciergeSnapshot = {
  /** The conversation so far, oldest first. Empty on first open. */
  messages: ConciergeMessage[];
  /** What the concierge remembers about this member. */
  memory: ConciergeMemoryItem[];
  /** The three tiles under "Try asking" on first open. */
  suggestions: string[];
};

/**
 * What the real backend has to do. The screen's local state stands in for
 * each of these today (no network, no persistence): `send` is answered from a
 * script, `forget` and `forgetAll` only change what the screen shows.
 *
 *   load        the snapshot above. Thread persistence: a conversation the
 *               member left is there when they return.
 *   send        one member message in, one reply out. Rejects when there is
 *               no connection or the service is down, which the screen shows
 *               as "Not sent. No connection." with Try again.
 *   forget      deletes one memory item (the x on the sheet, and Undo on the
 *               "Remembered" chip).
 *   forgetAll   deletes all memory for this member, with a server-side purge
 *               ("Forget everything").
 *
 * The screen takes `send` as an optional prop, so the real one is a server
 * action passed in by the page; until then the page passes `script` instead.
 */
export interface ConciergeBackend {
  load(): Promise<ConciergeSnapshot>;
  send(text: string): Promise<ConciergeReply>;
  forget(itemId: string): Promise<void>;
  forgetAll(): Promise<void>;
}

/**
 * Fake adapter only: canned replies for the screen to answer from, since it
 * has no network. A reply with a `prompt` answers exactly that question (the
 * "Try asking" tiles); the ones without are used in turn for anything else.
 */
export type ConciergeScript = {
  replies: { prompt: string | null; reply: Omit<ConciergeReply, "at"> }[];
};
