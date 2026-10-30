// Shared helpers for the Phase B scripts: the Phase A helpers (lib.mjs there: checks, psql, the fakes,
// sessions, the test-hook action caller, REST as a member) with the Phase B defaults (env.mjs: port 3241,
// prefix bf.), plus what stage 2 adds (the seeded fixtures, photos, the fake clock).
//
//   flock /tmp/next-build.lock npx next build --webpack
//   tests/e2e/phase-b/server.sh start prod
//   node tests/e2e/phase-b/run-all.mjs
//   tests/e2e/phase-b/server.sh stop
import './env.mjs';
import fs from 'node:fs';
import { BASE, action, sql1, svc } from '../phase-a/lib.mjs';

export * from '../phase-a/lib.mjs';

export const PREFIX = process.env.PHASE_A_TAG;

/** The seed's fixtures for this prefix (/home/claude/stack/tools/seed-<prefix>json, made by seed.mjs). */
export function seeded(prefix = PREFIX) {
  return JSON.parse(fs.readFileSync(`/home/claude/stack/tools/seed-${prefix}json`, 'utf8'));
}

/** A small real JPEG (a grey square), `size` pixels wide, made by the stack's tool (no new dependency). */
export function jpegBase64(size = 480) {
  const file = `/home/claude/stack/tools/fixtures/photo-${size}.jpg`;
  return fs.readFileSync(file).toString('base64');
}

/** A FormData argument for the test hook with a file in it. */
export const fileArg = (fields, files) => ({ $formData: fields, $files: files });

/** Call a cron job with the fake clock (the test hook only: ?now= is ignored unless MEMBERS_TEST_HOOKS=on). */
export async function cronAt(job, now) {
  const r = await fetch(`${BASE}/api/cron/${job}?now=${encodeURIComponent(new Date(now).toISOString())}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** A member's current photo row (members.photo_id). */
export function currentPhoto(memberId) {
  return sql1(`select p.* from member_photos p join members m on m.photo_id = p.id where m.id = '${memberId}'`);
}

export { action, svc };
