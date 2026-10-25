// What this browser session has opened. There is no backend, so "a chat you
// opened is read" would otherwise be forgotten the moment you move to another
// chat. This module-level set lives as long as the page does (a client
// navigation keeps it, a reload clears it), which is enough to show the
// behaviour. The backend replaces it with a real per-member read marker.

const OPENED = new Set<string>();

export function markChatOpened(chatId: string): void {
  OPENED.add(chatId);
}

export function wasChatOpened(chatId: string): boolean {
  return OPENED.has(chatId);
}
