// Stage 2 fix round, fixer 1: the release scripts.
//   QB2-03 / QB3-11  release/move-member-photos.mjs never undoes the club's removal, skips tiny photos, strips
//                    metadata without sharp, says "moved" only when something changed;
//   QB2-04 / QB3-04  release/delete-public-avatars.mjs refuses while photos are still to move, then deletes the old
//                    public copies through the Storage API (dry run first);
//   QB3-05           release/undo-photos-bucket.mjs empties and deletes the private bucket through the Storage API
//                    (against a Storage API stand-in that behaves as Supabase does: the local stub has no bucket
//                    delete), so the SQL undo needs no DELETE on storage tables.
//   PHASE_B_BASE=http://localhost:3251 PHASE_B_TAG=bx1. node tests/e2e/phase-b/14-fixes-fixer1-release.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PREFIX as TAG, action, adminSession, done, eq, exec, makeMember, makeMemberWithPhoto, ok, q, rand, sleep, sql1, svc } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const FIX = '/home/claude/stack/tools/fixtures';
const STORE = '/home/claude/stack/storage';
const RUN = `rl${rand()}`;
const PREFIX = `${TAG}t-${RUN}`;
const FILES = `${RUN}-`;
const script = (name, flags = [], env = {}) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [`${ROOT}/release/${name}`, ...flags], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...env } }) };
  } catch (err) {
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
};
const move = (flags = [], env = {}) => script('move-member-photos.mjs', ['--only-email-prefix', PREFIX, ...flags], env);
const del = (flags = []) => script('delete-public-avatars.mjs', ['--only-email-prefix', PREFIX, '--only-file-match', FILES, ...flags]);
async function withPublicAvatar(name, fixture, contentType, member = null) {
  const m = member ?? (await makeMember(`${RUN}${name}`));
  // The stage 1 upload's own name for a member's photo (avatars/<member id>-...): the only files the move takes (QR-02).
  const objectPath = `avatars/${m.id}-${FILES}${Date.now()}.${fixture.split('.').pop()}`;
  const { error } = await svc.storage.from('member-media').upload(objectPath, fs.readFileSync(`${FIX}/${fixture}`), { contentType });
  if (error) throw error;
  const url = svc.storage.from('member-media').getPublicUrl(objectPath).data.publicUrl;
  await svc.from('members').update({ avatar_url: url }).eq('id', m.id);
  return { ...m, objectPath, url };
}
const lineFor = (out, m) => out.split('\n').find((l) => l.includes(m.id)) ?? '';
const current = (m) => sql1(`select p.id, p.status, p.source, p.path, p.resized from members x left join member_photos p on p.id = x.photo_id where x.id = ${q(m.id)}`);
const AD = await adminSession(TAG);

// ================================================================ the move (QB2-03, QB3-11)
const ok1 = await withPublicAvatar('ok', 'photo-800.jpg', 'image/jpeg');
const tiny = await withPublicAvatar('tiny', 'photo-200.jpg', 'image/jpeg');
const exif = await withPublicAvatar('exif', 'photo-exif.jpg', 'image/jpeg');
// The club removed this member's stage 2 photo; they still have an old public one.
const removedFirst = await makeMemberWithPhoto(`${RUN}rmfirst`);
await withPublicAvatar('rmfirst', 'photo-480.jpg', 'image/jpeg', removedFirst);
eq((await action('admin.photos.adminRemovePhoto', [removedFirst.photoId, 'not_suitable'], AD)).result, { ok: true }, 'the club removes a member\'s stage 2 photo (they keep an old public one)');

const dry = move();
eq(dry.code, 0, 'move, dry run: exit 0');
ok(lineFor(dry.out, ok1).includes('would move'), 'an 800px photo would move');
ok(lineFor(dry.out, tiny).includes('needs a look: too small (200 x 200, under 400px'), 'QB3-11: a 200px photo is too small (the 400px rule): left, reported', lineFor(dry.out, tiny));
ok(lineFor(dry.out, removedFirst).includes('skipped: the club removed their latest photo'), 'QB2-03: the member whose photo the club removed is skipped, and reported', lineFor(dry.out, removedFirst));
eq(sql1(`select count(*)::int n from member_photos where member_id in (${[ok1, tiny, exif].map((m) => q(m.id)).join(',')})`).n, 0, 'the dry run changes nothing');

// Without sharp (MOVE_PHOTOS_NO_SHARP=on): the file as it is, metadata stripped.
const noSharp = move(['--apply'], { MOVE_PHOTOS_NO_SHARP: 'on' });
eq(noSharp.code, 0, 'move --apply without sharp: exit 0');
ok(/sharp: no, photos are copied as they are, metadata stripped/.test(noSharp.out), 'it says so');
const exifRow = current(exif);
eq([exifRow?.status, exifRow?.source, exifRow?.resized], ['approved', 'migrated', false], 'the Exif photo moved, as it was (not resized)');
const stored = fs.readFileSync(`${STORE}/member-photos/${exifRow.path}`);
ok(fs.readFileSync(`${FIX}/photo-exif.jpg`).includes(Buffer.from('Exif')) && !stored.includes(Buffer.from('Exif')) && stored[0] === 0xff && stored[1] === 0xd8, 'QB3-11: without sharp the metadata is stripped (the Exif block, location included, is gone; still a JPEG)');
eq(current(tiny)?.id ?? null, null, 'the tiny photo was not moved (they meet the photo gate)');
eq(current(removedFirst)?.id ?? null, null, 'the member whose photo the club removed did not get the old one back');
ok(lineFor(noSharp.out, ok1).includes('moved') && current(ok1)?.status === 'approved', 'the 800px photo moved');

// The club removes a moved photo; a re-run must never link it again.
eq((await action('admin.photos.adminRemovePhoto', [current(ok1).id, 'not_clear'], AD)).result, { ok: true }, 'the club removes the moved photo');
await sleep(300);
const rerun = move(['--apply']);
eq(rerun.code, 0, 'a re-run: exit 0');
ok(lineFor(rerun.out, ok1).includes('skipped: the club removed this photo after it was moved'), 'QB2-03: a re-run does not link the removed photo again, and says why', lineFor(rerun.out, ok1));
eq(sql1(`select photo_id from members where id = ${q(ok1.id)}`).photo_id, null, 'the member still has no photo (the gate)');
eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(ok1.id)} and source = 'migrated'`).n, 1, 'and no second copy was made');
ok(!/^\s+\S+\s{2}(moved|linked)/m.test(rerun.out), 'QB3-11: nothing is reported "moved" or "linked" when nothing changed', rerun.out);
// Moved before, then the link lost (a run stopped part way): linked once, then "already moved".
exec(`update members set photo_id = null where id = ${q(exif.id)}`);
const relink = move(['--apply']);
ok(lineFor(relink.out, exif).includes('linked (moved before)') && current(exif)?.status === 'approved', 'a moved photo whose link was lost is linked again');
ok(lineFor(move(['--apply']).out, exif).includes('already moved'), 'and the next run says "already moved"');

// ================================================================ deleting the old public copies (QB2-04, QB3-04)
const waiting = await withPublicAvatar('waiting', 'photo-480.jpg', 'image/jpeg');
const orphan = `avatars/${FILES}orphan-${Date.now()}.jpg`;
await svc.storage.from('member-media').upload(orphan, fs.readFileSync(`${FIX}/photo-480.jpg`), { contentType: 'image/jpeg' });
const files = () => fs.readdirSync(`${STORE}/member-media/avatars`).filter((f) => f.includes(FILES) && !f.endsWith('.__meta.json'));
const before = files();
ok(before.length >= 6, `the test's public copies are there (${before.length})`);
const refused = del(['--apply']);
eq(refused.code, 1, 'QB2-04: with a member still to move, the delete refuses (exit 1)');
ok(/REFUSED: 1 member still has a photo to move/.test(refused.out) && lineFor(refused.out, waiting).includes('not moved yet'), 'and names them', refused.out);
eq(files(), before, 'nothing was deleted');
eq(move(['--apply']).code, 0, 'the move runs');
eq(current(waiting)?.status, 'approved', 'the waiting member\'s photo is in the private bucket now');
const dryDel = del();
eq(dryDel.code, 0, 'delete, dry run: exit 0');
ok(before.every((f) => dryDel.out.includes(`would delete  avatars/${f}`)), 'it lists every public copy it would delete (moved, tiny, removed, the orphan)');
eq(files(), before, 'the dry run deletes nothing');
const applied = del(['--apply']);
eq(applied.code, 0, 'delete --apply: exit 0', applied.out);
eq(files(), [], 'QB2-04: every public copy is gone (through the Storage API)');
ok(/Every old public copy is gone\. Now set MEMBERS_PHOTOS_PRIVATE_DONE=on/.test(applied.out), 'and it says to set MEMBERS_PHOTOS_PRIVATE_DONE=on (the "It\'s never public" switch)');
eq(current(waiting)?.status, 'approved', 'the private copies are untouched');
ok(fs.existsSync(`${STORE}/member-photos/${current(waiting).path}`), 'their files too');
eq(del(['--apply']).code, 0, 'a second run: nothing to do');

// ================================================================ the undo's storage half (QB3-05)
// A Storage API stand-in, as hosted Supabase answers: a bucket with folders, list (folders have no id), remove,
// empty, and a bucket delete that refuses a bucket with files in it.
const bucket = { exists: true, files: new Set(['m1/a-full.jpg', 'm1/a-thumb.jpg', 'm2/b-full.jpg', 'top.jpg']) };
const calls = [];
const server = http.createServer(async (req, res) => {
  const body = await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString())); });
  const u = new URL(req.url, 'http://x');
  calls.push(`${req.method} ${u.pathname}`);
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const p = u.pathname.replace(/^\/storage\/v1\//, '');
  if (!/^Bearer service-key$/.test(req.headers.authorization ?? '')) return json(403, { message: 'not the service key' });
  if (p === 'bucket/member-photos' && req.method === 'GET') return bucket.exists ? json(200, { id: 'member-photos', name: 'member-photos', public: false }) : json(404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
  if (p === 'object/list/member-photos' && req.method === 'POST') {
    const { prefix = '', limit = 100, offset = 0 } = JSON.parse(body || '{}');
    const under = [...bucket.files].filter((f) => (prefix ? f.startsWith(`${prefix}/`) : true)).map((f) => (prefix ? f.slice(prefix.length + 1) : f));
    const names = [...new Set(under.map((f) => (f.includes('/') ? `${f.split('/')[0]}/` : f)))].sort();
    const items = names.map((n) => (n.endsWith('/') ? { name: n.slice(0, -1), id: null, metadata: null } : { name: n, id: `id-${n}`, metadata: { size: 1 } }));
    return json(200, items.slice(offset, offset + limit));
  }
  // A download (the undo's export first, since fix round 3).
  if (p.startsWith('object/member-photos/') && req.method === 'GET') {
    const name = decodeURIComponent(p.slice('object/member-photos/'.length));
    if (!bucket.files.has(name)) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    return res.end(Buffer.from(`photo ${name}`));
  }
  if (p === 'object/member-photos' && req.method === 'DELETE') {
    const { prefixes = [] } = JSON.parse(body || '{}');
    const gone = prefixes.filter((f) => bucket.files.delete(f));
    return json(200, gone.map((name) => ({ name, bucket_id: 'member-photos' })));
  }
  if (p === 'bucket/member-photos/empty' && req.method === 'POST') {
    bucket.files.clear();
    return json(200, { message: 'Successfully emptied' });
  }
  if (p === 'bucket/member-photos' && req.method === 'DELETE') {
    if (bucket.files.size) return json(409, { statusCode: '409', error: 'InvalidRequest', message: 'The bucket you tried to delete is not empty' });
    bucket.exists = false;
    return json(200, { message: 'Successfully deleted' });
  }
  return json(404, { message: `not here: ${req.method} ${p}` });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const api = `http://127.0.0.1:${server.address().port}`;
const undo = (flags = []) => new Promise((resolve) => {
  // Not execFileSync: the stand-in runs in this process and must answer while the script runs.
  import('node:child_process').then(({ execFile }) => execFile(process.execPath, [`${ROOT}/release/undo-photos-bucket.mjs`, ...flags], { cwd: ROOT, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: api, SUPABASE_SECRET_KEY: 'service-key' } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: `${stdout}${stderr}` })));
});
const u1 = await undo();
eq(u1.code, 0, 'undo-photos-bucket, dry run: exit 0');
ok(/DRY RUN \(nothing changed\): member-photos has 4 files/.test(u1.out) && bucket.files.size === 4 && bucket.exists, 'it counts the files in every folder and changes nothing', u1.out);
const exportDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'bx-undo-export-'));
const refusedUndo = await undo(['--apply']);
ok(refusedUndo.code === 2 && /REFUSED: member-photos has 4 files/.test(refusedUndo.out) && bucket.files.size === 4, 'fix round 3: --apply without an export is refused, nothing deleted', refusedUndo.out);
const u2 = await undo(['--apply', '--export-dir', exportDir]);
eq(u2.code, 0, 'undo-photos-bucket --apply --export-dir: exit 0', u2.out);
ok(['m1/a-full.jpg', 'm1/a-thumb.jpg', 'm2/b-full.jpg', 'top.jpg'].every((f) => fs.readFileSync(`${exportDir}/member-photos/${f}`, 'utf8') === `photo ${f}`), 'fix round 3: every file exported first, as it was');
fs.rmSync(exportDir, { recursive: true, force: true });
ok(!bucket.exists && bucket.files.size === 0, 'QB3-05: every file removed and the bucket deleted, through the Storage API');
ok(/APPLIED: removed 4 files and deleted the member-photos bucket/.test(u2.out), 'it says so', u2.out);
ok(calls.includes('DELETE /storage/v1/bucket/member-photos') && calls.filter((c) => c === 'DELETE /storage/v1/object/member-photos').length >= 1, 'with the API\'s own calls (remove, then delete the bucket)');
const u3 = await undo(['--apply']);
ok(u3.code === 0 && /There is no member-photos bucket: nothing to undo here/.test(u3.out), 'a second run: nothing to do');
server.close();
ok(!/delete\s+from\s+storage\./i.test(fs.readFileSync(`${ROOT}/release/undo-phase-b.sql`, 'utf8').replace(/--.*$/gm, '')), 'and the SQL undo has no DELETE on storage tables (the scratch-database proof: 14-fixes-fixer1-db.mjs)');

done();
