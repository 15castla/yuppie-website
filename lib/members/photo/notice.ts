// "Photo changed": a one-time note from the Change photo sheet to the You page
// it returns to. A sessionStorage flag, so the address stays clean and a
// reload does not show it again. Storage can be blocked or empty (private
// windows, some embedded web views), so every read and write is guarded and
// the page works without it: the note is a courtesy, never needed.

const KEY = "yuppie-photo-changed";

export function markPhotoChanged(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage is unavailable: the photo still changed, there is just no note.
  }
}

export function takePhotoChanged(): boolean {
  try {
    const seen = window.sessionStorage.getItem(KEY) === "1";
    if (seen) window.sessionStorage.removeItem(KEY);
    return seen;
  } catch {
    return false;
  }
}

// The app asks for the camera in its own words before the phone's dialog
// (iOS asks only once, so the words come first). Remembered per device so the
// pre-prompt is not shown on every tap; storage can be blocked, in which case
// it is simply shown each time.
const CAMERA_KEY = "yuppie-camera-asked";

export function hasAskedCamera(): boolean {
  try {
    return window.localStorage.getItem(CAMERA_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCameraAsked(): void {
  try {
    window.localStorage.setItem(CAMERA_KEY, "1");
  } catch {
    // Storage is unavailable: the pre-prompt will show again next time.
  }
}
