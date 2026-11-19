import crypto from 'node:crypto';
const secret = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }); const p = b64(payload);
  const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
if (process.argv[2]) {
  const now = Math.floor(Date.now() / 1000);
  console.log(sign({ iss: 'supabase', ref: 'local', role: process.argv[2], iat: now, exp: now + 10 * 365 * 24 * 3600 }));
}
