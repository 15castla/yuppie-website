// Shared by the stage 2 photo release scripts (move-member-photos.mjs, delete-public-avatars.mjs): what a member's
// old public photo (member-media/avatars/, stage 1) is, and what the move would do with it. Plain Node, no new
// dependency: the image checks are the app's own (lib/server/photos/image.ts), ported.

export const FROM = 'member-media';
export const TO = 'member-photos';
export const PUBLIC_PREFIX = `/storage/v1/object/public/${FROM}/`;
export const SIZES = { full: 480, thumb: 160 };
/** The photo rule (photo decision 2 A, the app's PHOTO_MIN_UPLOAD_PX): the shorter side at least 400px. */
export const MIN_SIDE = 400;

// ---------------------------------------------------------------- the file

export function detectType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && b.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
}

/** Width and height from the header (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X, GIF), or null. */
export function dimensions(b, type) {
  try {
    if (type === 'image/png') return b.toString('ascii', 12, 16) === 'IHDR' ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
    if (type === 'image/gif') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (type === 'image/webp') {
      const chunk = b.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const x = b.subarray(21, 25);
        return { width: 1 + (((x[1] & 0x3f) << 8) | x[0]), height: 1 + (((x[3] & 0xf) << 10) | (x[2] << 2) | ((x[1] & 0xc0) >> 6)) };
      }
      if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      return null;
    }
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      const length = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The file without its metadata (location data included), for when sharp is missing: JPEG APP1 to APP15 and
 * comments; PNG text, time and Exif chunks; WebP EXIF and XMP chunks (and their VP8X flags). Returns null for a
 * file it cannot read safely (it is then not moved).
 */
export function stripMetadata(b, type) {
  if (type === 'image/jpeg') {
    const out = [b.subarray(0, 2)];
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xda) {
        out.push(b.subarray(i));
        return Buffer.concat(out);
      }
      const length = b.readUInt16BE(i + 2);
      if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) out.push(b.subarray(i, i + 2 + length));
      i += 2 + length;
    }
    return null;
  }
  if (type === 'image/png') {
    const out = [b.subarray(0, 8)];
    let i = 8;
    while (i + 12 <= b.length) {
      const length = b.readUInt32BE(i);
      const name = b.toString('ascii', i + 4, i + 8);
      const end = i + 12 + length;
      if (!['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'].includes(name)) out.push(b.subarray(i, end));
      i = end;
      if (name === 'IEND') return Buffer.concat(out);
    }
    return null;
  }
  if (type === 'image/webp') {
    const chunks = [];
    let i = 12;
    while (i + 8 <= b.length) {
      const name = b.toString('ascii', i, i + 4);
      const size = b.readUInt32LE(i + 4);
      const end = i + 8 + size + (size % 2);
      if (end > b.length + 1) return null;
      if (name !== 'EXIF' && name !== 'XMP ') chunks.push(Buffer.from(b.subarray(i, Math.min(end, b.length))));
      i = end;
    }
    for (const c of chunks) if (c.toString('ascii', 0, 4) === 'VP8X') c[8] &= ~(0x08 | 0x04);
    const body = Buffer.concat(chunks);
    const head = Buffer.alloc(12);
    head.write('RIFF', 0, 'ascii');
    head.writeUInt32LE(body.length + 4, 4);
    head.write('WEBP', 8, 'ascii');
    return Buffer.concat([head, body]);
  }
  return null;
}

/** The object path in member-media for a public URL of it (a ?query ignored), or null. Works whatever the host. */
export function objectPathOf(url) {
  try {
    const u = new URL(url);
    const at = u.pathname.indexOf(PUBLIC_PREFIX);
    if (at < 0) return null;
    return decodeURIComponent(u.pathname.slice(at + PUBLIC_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * Is this path the member's own stage 1 photo (lib/media-storage.ts: avatars/<member id>-<time>.<ext>)? Only those
 * are moved (QR-02): avatar_url was member-writable in stage 1, so it may point at any file in member-media (an
 * event image, a partner's logo, another member's photo). The app's Delete my account uses the same rule.
 */
export function isOwnAvatar(path, memberId) {
  const own = `avatars/${memberId}-`;
  if (typeof path !== 'string' || !memberId || !path.startsWith(own)) return false;
  const name = path.slice(own.length);
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name) && !name.includes('..');
}

/**
 * The EXIF orientation of a photo (1 to 8; 1 is the right way up), or 1 when it has none. A phone often stores a
 * portrait photo sideways with orientation 6 or 8, and browsers turn it on screen; stripping the metadata without
 * turning the pixels (no sharp) would show it sideways (QR-03). JPEG APP1 "Exif", PNG eXIf, WebP EXIF.
 */
export function exifOrientation(b, type) {
  try {
    let tiff = null;
    if (type === 'image/jpeg') {
      let i = 2;
      while (i + 4 <= b.length && b[i] === 0xff) {
        const marker = b[i + 1];
        if (marker === 0xda || marker === 0xd9) break;
        const length = b.readUInt16BE(i + 2);
        if (marker === 0xe1 && b.toString('ascii', i + 4, i + 10) === 'Exif\0\0') {
          tiff = b.subarray(i + 10, i + 2 + length);
          break;
        }
        i += 2 + length;
      }
    } else if (type === 'image/png') {
      let i = 8;
      while (i + 12 <= b.length) {
        const length = b.readUInt32BE(i);
        const name = b.toString('ascii', i + 4, i + 8);
        if (name === 'eXIf') {
          tiff = b.subarray(i + 8, i + 8 + length);
          break;
        }
        if (name === 'IEND') break;
        i += 12 + length;
      }
    } else if (type === 'image/webp') {
      let i = 12;
      while (i + 8 <= b.length) {
        const name = b.toString('ascii', i, i + 4);
        const size = b.readUInt32LE(i + 4);
        if (name === 'EXIF') {
          tiff = b.subarray(i + 8, i + 8 + size);
          if (tiff.toString('ascii', 0, 6) === 'Exif\0\0') tiff = tiff.subarray(6);
          break;
        }
        i += 8 + size + (size % 2);
      }
    }
    if (!tiff || tiff.length < 8) return 1;
    const order = tiff.toString('ascii', 0, 2);
    if (order !== 'II' && order !== 'MM') return 1;
    const u16 = (o) => (order === 'II' ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
    const u32 = (o) => (order === 'II' ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
    const ifd = u32(4);
    const count = u16(ifd);
    for (let n = 0; n < count; n += 1) {
      const entry = ifd + 2 + n * 12;
      if (entry + 12 > tiff.length) break;
      if (u16(entry) === 0x0112) {
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
    return 1;
  } catch {
    return 1;
  }
}

/** Every file under a folder of a bucket, through the Storage API, folders walked (1,000 at a time). */
export async function listAll(db, bucket, folder = '') {
  const out = [];
  const seen = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const page = (data ?? []).filter((item) => !seen.has(item.name));
    for (const item of page) {
      seen.add(item.name);
      const path = folder ? `${folder}/${item.name}` : item.name;
      // A folder has no id (the Storage API's listing): walk it.
      if (!item.id) out.push(...(await listAll(db, bucket, path)));
      else out.push(path);
    }
    if ((data ?? []).length < 1000 || !page.length) return out;
  }
}

// ---------------------------------------------------------------- what the move does with a member

/**
 * What the move would do with one member's old public photo, from the database and the file, changing nothing:
 *   { action: 'move', path, bytes, type, size }   copy it into the private bucket and make it current;
 *   { action: 'link', photoId }                   moved before (a run that stopped part way): make it current;
 *   { action: 'none', outcome, detail }           nothing to do, or a member to look at (they meet the photo gate).
 * Never undoes the club's decision (QB2-03, QB3-11): a member whose latest photo the club removed is left alone,
 * and a moved photo the club removed is never linked again.
 */
export async function classify(db, member) {
  const none = (outcome, detail = '') => ({ action: 'none', outcome, detail });
  if (member.deleted_at) return none('skipped: deleted account');
  const path = objectPathOf(member.avatar_url);
  if (!path) return none('needs a look: the photo link is not in member-media', member.avatar_url);
  if (!path.startsWith('avatars/')) return none('needs a look: not in member-media/avatars/', path);
  const [{ data: before, error: beforeError }, { data: latest, error: latestError }] = await Promise.all([
    db.from('member_photos').select('id, status').eq('member_id', member.id).eq('legacy_url', member.avatar_url).order('created_at', { ascending: false }).limit(1),
    db.from('member_photos').select('id, status, source, created_at').eq('member_id', member.id).order('created_at', { ascending: false }).limit(1),
  ]);
  if (beforeError || latestError) throw beforeError ?? latestError;
  const moved = before?.[0] ?? null;
  if (member.photo_id) return none(moved ? 'already moved' : 'skipped: has a photo already (stage 2)');
  // Only the member's own file (QR-02), checked before anything is linked or copied.
  if (!isOwnAvatar(path, member.id)) return none('needs a look: not their own photo file (only avatars/<member id>-... is moved)', path);
  if (moved?.status === 'removed') return none('skipped: the club removed this photo after it was moved (not linked again)', path);
  if (latest?.[0]?.status === 'removed') return none('skipped: the club removed their latest photo (they meet the photo gate)', path);
  if (moved && moved.status !== 'approved' && moved.status !== 'pending') return none(`skipped: moved before and ${moved.status} since`, path);
  if (moved) return { action: 'link', photoId: moved.id };
  const { data: blob, error: downloadError } = await db.storage.from(FROM).download(path);
  if (downloadError || !blob) return none('needs a look: the file is missing', path);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const type = detectType(bytes);
  if (!type) return none('needs a look: the file is not a photo', path);
  const size = dimensions(bytes, type);
  if (!size) return none('needs a look: the photo could not be read', path);
  if (Math.min(size.width, size.height) < MIN_SIDE) return none(`needs a look: too small (${size.width} x ${size.height}, under ${MIN_SIDE}px; they meet the photo gate)`, path);
  return { action: 'move', path, bytes, type, size };
}

/** Every member with a photo link, oldest first (1,000 at a time). */
export async function membersWithAvatars(db, onlyPrefix = null) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from('members').select('id, email, avatar_url, photo_id, deleted_at').not('avatar_url', 'is', null).order('created_at', { ascending: true }).range(from, from + 999);
    if (onlyPrefix) q = q.ilike('email', `${onlyPrefix}%`);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
