// TOTP codes for the local test admin (RFC 6238: HMAC-SHA-1, 6 digits, 30 second steps), written by hand.
// Usage: import { totp, base32Decode } from '/home/claude/stack/tools/totp.mjs'; totp(secret) -> "123456"
// CLI:   node /home/claude/stack/tools/totp.mjs <base32 secret>
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// RFC 4648 base32, case-insensitive, padding and spaces ignored.
export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`not base32: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// RFC 4226 HOTP with dynamic truncation.
export function hotp(key, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// RFC 6238: T = floor((now - T0) / X), T0 = 0, X = 30.
export function totp(secret, nowMs = Date.now(), step = 30, digits = 6) {
  return hotp(base32Decode(secret), Math.floor(nowMs / 1000 / step), digits);
}

/** Seconds left in the current 30 second window. */
export function secondsLeft(nowMs = Date.now(), step = 30) {
  return step - (Math.floor(nowMs / 1000) % step);
}

/** A code with at least `minSeconds` of life left (waits for the next window if needed). */
export async function freshTotp(secret, minSeconds = 5) {
  if (secondsLeft() < minSeconds) await new Promise((r) => setTimeout(r, secondsLeft() * 1000 + 200));
  return totp(secret);
}

// Self-check against the RFC 6238 appendix B vectors (SHA-1, 8 digits, secret "12345678901234567890").
export function selfTest() {
  const key = Buffer.from('12345678901234567890');
  const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [t, want] of vectors) {
    const got = hotp(key, Math.floor(t / 30), 8);
    if (got !== want) throw new Error(`TOTP self-test failed at T=${t}: ${got} != ${want}`);
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
  if (process.argv[2]) console.log(totp(process.argv[2]));
  else console.log('self-test ok');
}
