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
import { BASE, action, sql, sql1, svc } from '../phase-a/lib.mjs';

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

// ---------------------------------------------------------------- stage 2 people and plans
import { makeMember, memberSession as session0, exec as exec0, q as q0, sql1 as sql10 } from '../phase-a/lib.mjs';

/** A member (phase A's makeMember: a fresh auth user, fake Stripe customer and subscription) with an approved photo in the private bucket. */
export async function makeMemberWithPhoto(name, state = 'active', fields = {}) {
  const member = await makeMember(name, state, fields);
  const path = `${member.id}/test-${name}-full.jpg`;
  const { error } = await svc.storage.from('member-photos').upload(path, fs.readFileSync('/home/claude/stack/tools/fixtures/photo-480.jpg'), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data, error: e2 } = await svc.from('member_photos').upsert({ member_id: member.id, path, status: 'approved', source: 'new', face_check: 'found', reviewed_at: new Date().toISOString() }, { onConflict: 'path' }).select('id').single();
  if (e2) throw e2;
  await svc.from('members').update({ photo_id: data.id }).eq('id', member.id);
  return { ...member, photoId: data.id, session: await session0(member.email) };
}

/** London date and time `days` from now, as the post form sends them. */
export function londonFormDate(daysFromNow, hhmm = '18:30') {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { date, time: hhmm };
}

/** A free plan's form values. */
export function planInput(over = {}) {
  return { title: 'Test plan', type: 'Sport', ...londonFormDate(5), where: 'Calder Park', places: 4, hostGoing: true, note: '', cost: null, ...over };
}

/** Post a plan as a member through the real action; returns the plan id. */
export async function postPlan(member, over = {}) {
  const r = await action('invite.postOpenInvite', [planInput(over)], member.session);
  if (!r.result?.ok) throw new Error(`postPlan: ${JSON.stringify(r.result)}`);
  return r.result.id;
}

/** Message log rows for stage 2 refs (plan, chat, report, photo), oldest first. */
export function logRows(where) {
  return sql(`select channel, template, status, to_address, dedupe_key, error, member_id, plan_id, chat_id, report_id, photo_id, booking_id from message_log where ${where} order by created_at`);
}

/** Move a plan's start (tests only): to a time relative to now, in minutes. */
export function setPlanStart(planId, minutesFromNow) {
  exec0(`update plans set starts_at = now() + interval '${minutesFromNow} minutes' where id = ${q0(planId)}`);
}
export const planRow = (id) => sql10(`select * from plans where id = ${q0(id)}`);
