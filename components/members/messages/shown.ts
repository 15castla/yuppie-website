// Whether this tab has already put a given server drawing on screen. The router keeps pages for a while
// (next.config staleTimes.dynamic) and brings them back on Back and on links, as they were drawn: a chat read a
// moment ago still unread in the inbox, a thread without its newest messages. A drawing is known by what it is
// and the server's clock when it was drawn, so the second time one is shown it is a copy from that cache and the
// screen asks the server again at once. No clocks are compared, so a device clock that is off does not matter.

const SHOWN = new Set<string>();

/** True when this drawing was on screen before (a cached copy); records it otherwise. */
export function shownBefore(key: string): boolean {
  if (SHOWN.has(key)) return true;
  SHOWN.add(key);
  return false;
}
