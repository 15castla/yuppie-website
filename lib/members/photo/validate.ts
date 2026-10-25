// The photo checks the design draws, run in the browser before anything
// uploads (specs/photo.md "Errors"): the wrong kind of file, a file over
// 10 MB, a photo under 400 pixels wide. Pure functions plus one decode step,
// so the gate and Change photo share them. Nothing here talks to the server.

export const MIN_PHOTO_WIDTH = 400;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// What the member sees for each way a photo can fail. What happened, then
// what to do. "upload" is the server step; the rest are checked here.
// "unreadable" is the one line not in the design: a HEIC this browser cannot
// open (Safari can; most others cannot). Needs Albert's eye.
export type PhotoErrorKind = "small" | "type" | "large" | "upload" | "unreadable";

export const PHOTO_ERRORS: Record<PhotoErrorKind, { title: string; text: string }> = {
  small: { title: "Too small.", text: "Choose a photo at least 400 pixels wide." },
  type: { title: "That file isn’t a photo.", text: "Choose a JPG, PNG or HEIC." },
  large: { title: "That file is too big.", text: "Choose one under 10 MB." },
  upload: { title: "Your photo didn’t upload.", text: "Check your connection and try again." },
  unreadable: { title: "We can’t open that photo.", text: "Choose a JPG or PNG." },
};

const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const OK_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

function isHeic(file: File): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

// Type and size, from the file alone. Some browsers give a HEIC no type at
// all, so the name decides when the type is empty.
export function checkFile(file: File): PhotoErrorKind | null {
  const typeOk = file.type ? OK_TYPES.has(file.type.toLowerCase()) : OK_EXTENSIONS.test(file.name);
  if (!typeOk) return "type";
  if (file.size > MAX_PHOTO_BYTES) return "large";
  return null;
}

export type PhotoSource = {
  /** An object URL for the chosen file (revoke it when done). */
  url: string;
  width: number;
  height: number;
};

// Decode the file in the browser. Fails as "unreadable" for a HEIC this
// browser cannot open and as "type" for anything else that is not an image.
export async function readPhoto(file: File): Promise<{ source: PhotoSource } | { error: PhotoErrorKind }> {
  const early = checkFile(file);
  if (early) return { error: early };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
    if (img.naturalWidth < MIN_PHOTO_WIDTH) {
      URL.revokeObjectURL(url);
      return { error: "small" };
    }
    return { source: { url, width: img.naturalWidth, height: img.naturalHeight } };
  } catch {
    URL.revokeObjectURL(url);
    return { error: isHeic(file) ? "unreadable" : "type" };
  }
}
