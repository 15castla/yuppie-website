import "server-only";

// Reading and preparing a member photo on the server, with no new dependency.
//
// - The type is read from the file's first bytes (JPEG, PNG, WebP), never trusted from the browser.
// - The size is read from the file's header (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X).
// - Resizing uses sharp, which Next installs as its own optional dependency for image optimisation. It is
//   loaded with a guarded dynamic import: where it is missing (a platform without its binary) the upload is
//   stored as the browser sent it (the cropper's JPEG, at most 800px), within the size rules, with its
//   metadata stripped here by hand (location data included), and `resized: false` is recorded.

import { PHOTO_SIZES } from "../config";

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

export function detectType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** Width and height from the header, or null when the file is not a well-formed image of its type. */
export function dimensions(bytes: Uint8Array, type: PhotoType): { width: number; height: number } | null {
  try {
    if (type === "image/png") {
      if (ascii(bytes, 12, 4) !== "IHDR") return null;
      return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
    }
    if (type === "image/webp") {
      const chunk = ascii(bytes, 12, 4);
      if (chunk === "VP8 ") return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = bytes.subarray(21, 25);
        return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
      }
      if (chunk === "VP8X") return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
      return null;
    }
    // JPEG: walk the segments to the first start-of-frame.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const length = u16be(bytes, i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
      i += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The file without its metadata: JPEG APP1 to APP15 (Exif and its location data, XMP, ICC) and comments; PNG
 * text, time and Exif chunks. WebP is left as it is (the cropper never sends one). Used only when sharp is
 * missing; sharp drops all metadata by itself.
 */
export function stripMetadata(bytes: Uint8Array, type: PhotoType): Uint8Array {
  if (type === "image/jpeg") {
    const out: Uint8Array[] = [bytes.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      if (marker === 0xda) {
        out.push(bytes.subarray(i));
        return concat(out);
      }
      const length = u16be(bytes, i + 2);
      const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
      if (!drop) out.push(bytes.subarray(i, i + 2 + length));
      i += 2 + length;
    }
    return bytes;
  }
  if (type === "image/png") {
    const out: Uint8Array[] = [bytes.subarray(0, 8)];
    let i = 8;
    while (i + 12 <= bytes.length) {
      const length = u32be(bytes, i);
      const name = ascii(bytes, i + 4, 4);
      const end = i + 12 + length;
      if (!["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(name)) out.push(bytes.subarray(i, end));
      i = end;
      if (name === "IEND") break;
    }
    return concat(out);
  }
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

type Sharp = (typeof import("sharp"))["default"];

let sharpLoad: Promise<Sharp | null> | null = null;

/**
 * sharp, if this platform has it; null otherwise. Loaded once. It is in Next's own list of server external
 * packages, so this import stays a runtime require (and the deployment's file tracing includes it) rather than
 * being bundled. It is not in package.json: it comes with next as its optional dependency.
 */
async function loadSharp(): Promise<Sharp | null> {
  if (process.env.MEMBERS_PHOTO_NO_SHARP === "on") return null; // the test hook for the fallback path
  sharpLoad ??= (async () => {
    try {
      const mod = await import("sharp");
      return mod.default ?? (mod as unknown as Sharp);
    } catch (err) {
      console.error("photos: sharp is not available here, so photos are stored as sent:", err instanceof Error ? err.message : err);
      return null;
    }
  })();
  return sharpLoad;
}

export type PreparedPhoto = {
  full: { bytes: Uint8Array; contentType: PhotoType; width: number; height: number };
  /** Null when there is no separate small file (sharp missing): the full file is used everywhere. */
  thumb: { bytes: Uint8Array; contentType: PhotoType; width: number; height: number } | null;
  resized: boolean;
};

/** The square files the members area shows: 480px and 160px JPEGs, centred, orientation applied, no metadata. */
export async function preparePhoto(bytes: Uint8Array, type: PhotoType, size: { width: number; height: number }): Promise<PreparedPhoto> {
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const make = async (px: number) => {
        const out = await sharp(Buffer.from(bytes))
          .rotate()
          .resize(px, px, { fit: "cover", withoutEnlargement: true })
          .flatten({ background: "#F5F3E7" })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        const side = Math.min(px, Math.min(size.width, size.height));
        return { bytes: new Uint8Array(out), contentType: "image/jpeg" as const, width: side, height: side };
      };
      return { full: await make(PHOTO_SIZES.full), thumb: await make(PHOTO_SIZES.thumb), resized: true };
    } catch (err) {
      console.error("photos: sharp could not resize this photo, so it is stored as sent:", err instanceof Error ? err.message : err);
    }
  }
  return { full: { bytes: stripMetadata(bytes, type), contentType: type, width: size.width, height: size.height }, thumb: null, resized: false };
}
