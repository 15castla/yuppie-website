// Links are blocked in chats; phone numbers and email addresses go through.
// This is the composer's courtesy check (it explains before you press send);
// the rule that counts is the server's, which the backend must enforce on
// every message (types.ts, ChatMessage). Tuned to catch what people paste
// (a scheme, "www.", a shortener, a bare domain) without flagging a sentence
// typed without a space after its full stop ("See you there.Bring a towel").

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const SCHEME = /\b(?:https?|ftp):\/\/\S+/i;
const WWW = /\bwww\.\S+/i;
// Real top-level domains people paste. Short ones that are also English words (me, it, to, be, us) are left out on purpose.
const TLDS =
  "com|co\\.uk|org|net|io|uk|app|ly|gl|link|xyz|info|biz|dev|gg|tv|fm|cc|ch|de|fr|es|nl|ie|ca|au|nz|shop|store|site|online|page";
const BARE = new RegExp(`\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?![a-z0-9-])`, "i");

export function containsLink(text: string): boolean {
  const withoutEmails = text.replace(EMAIL, " ");
  return SCHEME.test(withoutEmails) || WWW.test(withoutEmails) || BARE.test(withoutEmails);
}
