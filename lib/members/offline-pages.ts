// The members pages saved on the phone for offline use (public/members-sw.js, 13 Nov 2026), wiped from the Log in
// page: whoever signs in next starts with nothing of the last member's. The site's own files (cy-assets-*) stay.
export function clearMemberPages(): void {
  try {
    if (typeof caches === "undefined") return;
    void caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => /^cy-(pages|images|meta)-/.test(k)).map((k) => caches.delete(k))))
      .catch(() => {});
  } catch {
    // no Cache Storage here (an old browser, a private window): nothing was saved
  }
}
