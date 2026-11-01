// The Concierge's rules that the server enforces on what the AI writes, as pure functions (no imports), so they can
// be checked on their own: tests/e2e/concierge/00-rules.mjs runs this file directly with Node.

/** An offer to book, reserve or contact a place for the member: the Concierge recommends and never books. */
const OFFERS: RegExp[] = [
  // "I'll book…", "I can make a reservation", "we could grab you a table", "I'd be happy to book", "let me reserve"
  /\b(i|we)(\s*(['’]ll|['’]d|will|would|can|could|shall|should|may|might))?(\s+(be\s+)?(happy|glad|delighted)\s+to)?\s+(go ahead and\s+|happily\s+|gladly\s+|try (to|and)\s+|also\s+)?(book|reserve|make (a|the|your) (booking|reservation)|get (you|us) (in|a table|a booking)|grab (you |us )?(a )?table|secure (you |us )?(a )?table|hold (you |us )?(a )?table)\b/i,
  /\blet me\s+(go ahead and\s+|try (to|and)\s+)?(book|reserve|make (a|the|your) (booking|reservation)|get (you|us) (in|a table)|grab (you )?(a )?table|secure (you )?(a )?table)\b/i,
  // "I'll ring them", "I could call the restaurant for you", "let me email them"
  /\b(i|we|let me)(\s*(['’]ll|['’]d|will|would|can|could|shall))?(\s+(be\s+)?(happy|glad)\s+to)?\s+(go ahead and\s+|try (to|and)\s+)?(ring|call|phone|message|email|contact|text|whatsapp)\s+(them|the (restaurant|venue|bar|pub|place|club|team)|it|ahead|on your behalf|for you)\b/i,
  // "Would you like me to book?", "Shall I make a reservation?", "Want me to try and book?", "Should I book a table?"
  /\b(would you like|do you want|want|shall|should|can|could)\s+(me|i)\s+(to\s+)?(go ahead and\s+|try (to|and)\s+)?(book|reserve|make (a|the|your) (booking|reservation)|ring|call|phone|contact|grab|secure|hold|get you)\b/i,
  // "I've booked", "We have reserved a table"
  /\b(i|we)\s*(['’]ve|have|['’]ll have)\s+(just\s+)?(booked|reserved|made (a|the|your) (booking|reservation))\b/i,
  // "…book it for you", "…reserve a table for you"
  /\b(book|reserve)\s+(it|this|one|a table|that|you a table|a spot)\s+for you\b/i,
  // "I can get you in at 8", "I'll get you a table"
  /\b(i|we)(\s*(['’]ll|['’]d|will|would|can|could))?\s+get you (in|a table|a booking)\b/i,
];

export function offersToBook(text: string): boolean {
  return OFFERS.some((re) => re.test(text));
}

/** A fact pill is never a time, a date-time, a price or a table size. */
export function isBadFact(fact: string): boolean {
  return /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(am|pm)\b|£|\$|€|\btable for\b|\bbook\b|\bbooking\b|\breserv/i.test(fact);
}

/** Sentences of running copy in the house style: no exclamation marks, no em or en dashes, no emoji. */
export function houseStyle(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/!+/g, ".")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/([,.]){2,}/g, "$1")
    .trim()
    .slice(0, max)
    .trim();
}

/** A name or an address: kept as written (a venue may be called "Yo! Sushi"), only tidied and limited. */
export function plain(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u{1F000}-\u{1FAFF}\u{FE0F}]/gu, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/**
 * What the Concierge may remember: tastes, never health, religion or other sensitive things, never other people's
 * names. The prompt asks for this; this is the server's own check.
 */
export function rememberable(line: string): boolean {
  if (!line || line.length > 60) return false;
  return !/\b(allerg\w*|coeliac|celiac|gluten[- ]free|intoleran\w*|diabet\w*|pregnan\w*|medic\w*|medication|disab\w*|wheelchair|mental|anxiety|anxious|depress\w*|adhd|autis\w*|illness|ill\b|sick|health|condition|therap\w*|sober|recovery|alcoholic|religio\w*|halal|kosher|muslim|jewish|christian|hindu|sikh|faith|church|mosque|synagogue|temple|gay|lesbian|bisexual|trans\w*|queer|lgbt\w*|politic\w*|tory|labour|pronoun\w*|divorc\w*|salary|debt|money worries)\b/i.test(line);
}
