// Links are blocked in chats; phone numbers and email addresses go through.
//
// THE SERVER MUST ENFORCE THE SAME RULE. This is only the composer's courtesy
// check: it explains before you press send and keeps Send inert. It runs in
// the member's browser, so anyone can skip it. The rule that counts is the
// server's, which must run the same test (this function, or a port of it with
// the same cases below) on every message it is asked to store, and refuse the
// message when it fails (types.ts, ChatMessage). The backend step must not
// ship without it.
//
// What it catches (the reason for the rule is that a link is a way to take a
// chat somewhere we cannot see, WhatsApp above all):
//   - a scheme (https://, ftp://, hxxp://, any word followed by ://), also
//     with spaces in it ("h t t p : //x"), and "www.";
//   - known link and hand-off hosts with or without a path (wa.me, t.me,
//     youtu.be, linktr.ee, bit.ly, discord.gg ...);
//   - any host with a path: "name.tld/something", whatever the ending;
//   - a bare domain on a real ending: common ones (com, net, org, io, uk ...)
//     always, and a long list of word-like ones (club, studio, london, agency,
//     shop ...) when typed the way a domain is pasted, so "see you there.Club
//     night" (a full stop with no space and a capital) is left alone;
//   - spaced, bracketed and spelled-out dots: "example . com", "example[.]com",
//     "example (dot) com", "example dot com", and lookalike dots and invisible
//     characters ("example。com", "exam​ple.com").
// What it leaves alone: phone numbers, email addresses, times, prices and
// ordinary sentences, including one typed without a space after its full stop
// ("See you there.Bring a towel").
// Known limits (the server rule has the same ones, decide there): a name that
// is also a domain ending in capitals ("Dan.Com") is read as a domain and
// blocked, because a pasted "Example.Com" looks the same; letters spelled out
// one by one ("e x a m p l e . c o m") and links in another script are not
// caught.

// An address: kept out of the domain checks ("sam@example.co.uk" goes through). The local part cannot hold "/" or
// ":", so "instagram.com/@sam.jones" is a link with an @ in it, not an email.
const EMAIL = /[^\s@/:]+@[^\s@/]+\.[^\s@/]+/g;
const SCHEME = /\b[a-z][a-z0-9+.-]*:\/\/\S/i;
// "h t t p : //", "hxxp://": the scheme written so a filter would miss it.
const SPACED_SCHEME = /h\s*[tx]\s*[tx]\s*p\s*s?\s*:\s*\/\s*\//i;
const WWW = /\bwww\s*\.\s*\S/i;
// An address of numbers with a port or a path: 192.168.0.1:8080, 10.0.0.1/admin.
const IP_URL = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+|\/\S)/;

// Hosts that are links wherever they stand, even where the ending is an English word (me, be, to, gl) or there is no path.
const HOSTS = [
  "wa.me", "t.me", "telegram.me", "telegram.org", "m.me", "fb.me", "ig.me", "snap.com", "signal.me", "signal.group",
  "youtu.be", "youtube.com", "linktr.ee", "lnk.bio", "bit.ly", "bitly.com", "tinyurl.com", "goo.gl", "t.co", "is.gd",
  "ow.ly", "buff.ly", "rb.gy", "cutt.ly", "tr.ee", "shorturl.at", "rebrand.ly", "lnkd.in", "amzn.to", "spoti.fi",
  "discord.gg", "discord.com", "whatsapp.com", "paypal.me", "ko-fi.com", "instagram.com", "facebook.com", "fb.com",
  "twitter.com", "x.com", "tiktok.com", "linkedin.com", "snapchat.com", "zoom.us", "calendly.com", "onlyfans.com",
];

// Endings that are not English words: a name that ends in one is a link wherever it is capitalised.
const STRONG_TLDS = new Set(
  (
    "com org net io uk app ly gl link xyz info biz dev gg tv fm cc ch de fr es nl ie ca au nz ee eu co ai sh ws vc ru cn jp " +
    "mobi tel vip xxx icu"
  ).split(" "),
);
// Endings that are also ordinary words. A link is typed the way it is pasted, in lower case (or all capitals); a
// Capital after a lower-case word is the start of the next sentence typed with no space ("See you there.Club night").
const WORD_TLDS = new Set(
  (
    "shop store site online page club studio london agency live life world today news space tech digital social media " +
    "group team network systems solutions email chat events party tickets fitness yoga bar pub cafe restaurant design art " +
    "music photography photo gallery blog wiki website web click one fun pro work zone love wine beer coffee pizza " +
    "kitchen food bio ink wales scot cymru nyc paris berlin casino loan help plus run games gym sport golf tennis " +
    "football boutique fashion academy company business ventures capital partners finance money market " +
    "name top win cam bet lol wtf cloud"
  ).split(" "),
);
// The endings a spelled-out or spaced dot is read against ("example dot com"): the strong ones only, so a sentence
// that happens to say "dot" or put a space before a full stop is left alone.
const STRONG_ALT = [...STRONG_TLDS].join("|");

const SPACED_DOT = new RegExp(`(\\S)\\s+\\.\\s*(?=(?:${STRONG_ALT})(?![\\p{L}\\p{N}-]))`, "giu");
const SPOKEN_DOT = new RegExp(`(\\S)\\s+dot\\s+(?=(?:${STRONG_ALT})(?![\\p{L}\\p{N}-]))`, "giu");
const BRACKET_DOT = /\s*[\[({<]\s*(?:\.|dot)\s*[\])}>]\s*/giu;

// A name written like a domain: labels, a dot, an ending. The ending is read in code (case matters).
const DOMAIN = /(^|[^\p{L}\p{N}._-])((?:[\p{L}\p{N}][\p{L}\p{N}-]*\.)+)([a-z]{2,})(?![\p{L}\p{N}-])(\/[\p{L}\p{N}])?/giu;

/** The text the checks read: one spelling of the dot, no invisible characters, no full-width letters. */
function plain(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[­​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[。｡]/g, ".")
    .replace(BRACKET_DOT, ".")
    .replace(SPACED_DOT, "$1.")
    .replace(SPOKEN_DOT, "$1.");
}

function isCapitalised(word: string): boolean {
  return /^[A-Z][a-z]+$/.test(word);
}

function isHost(host: string): boolean {
  const name = host.toLowerCase();
  return HOSTS.some((known) => name === known || name.endsWith(`.${known}`));
}

function hasDomain(text: string): boolean {
  for (const match of text.matchAll(DOMAIN)) {
    const [, , labels, ending, path] = match;
    const lower = ending.toLowerCase();
    if (isHost(labels + lower)) return true;
    if (STRONG_TLDS.has(lower)) return true;
    // Not an ending we know: only a path makes it a link, and only when it is typed as one ("name.tld/page").
    if (!isCapitalised(ending)) {
      if (WORD_TLDS.has(lower) || path) return true;
    }
  }
  return false;
}

export function containsLink(text: string): boolean {
  const spelled = plain(text);
  // A scheme, "www." and a numeric address are links wherever they appear, an "@" in the path or not.
  if (SPACED_SCHEME.test(spelled) || SCHEME.test(spelled) || WWW.test(spelled) || IP_URL.test(spelled)) return true;
  return hasDomain(spelled.replace(EMAIL, " "));
}
