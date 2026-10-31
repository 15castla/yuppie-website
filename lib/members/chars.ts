// Counting characters the way the server does: Unicode code points ([...text].length), so an emoji is one
// character, as it is for the server's checks (lib/server/plans.ts checkNewInvite, chats.ts sendChatMessage) and
// the database's char_length. A browser's own maxlength counts UTF-16 units (an emoji is two), so the forms and
// the composer clip with clipChars instead, and their counters use charCount.

/** How many characters `text` is, as the server counts them. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** `text` cut to at most `max` characters, as the server counts them (never half an emoji). */
export function clipChars(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  let n = 0;
  for (const ch of text) {
    if (n === max) break;
    out += ch;
    n += 1;
  }
  return out;
}

/** The longest a field can be in UTF-16 units: a cap for maxlength that never stops a text the server allows. */
export const utf16Cap = (max: number) => max * 2;
