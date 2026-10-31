// Stage 2 fix round 3: the stage 2 release and its undo, end to end, on a SCRATCH database of their own (never the
// shared one), in the hosted layout fixer 1 used (/home/claude/build-b/qa/qb3/live: storage tables owned by
// supabase_storage_admin, DELETE on them refused except through the Storage API), with the live-like rows (four
// members, each with an old public member-media/avatars/ photo). The real release scripts run against it through
// a PostgREST of its own and a Storage API stand-in that keeps storage.objects as Supabase does (rows written and
// deleted with the files, the bucket delete refused while files are in it). In the order of
// release/live-migration-notes.md (stage 2):
//   release 1  the two migrations;
//   release 2  move-member-photos.mjs, dry run then --apply (only each member's own avatars/<id>-... file);
//   release 5  delete-public-avatars.mjs, dry run then --apply;
//   undo 2     undo-photos-bucket.mjs --export-dir: every file saved and read back, with the manifest; nothing deleted
//              (and --apply without an export, or with the folder inside the repo, refused);
//   undo 3     undo-photos-bucket.mjs --apply --export-dir: the bucket emptied and deleted through the API;
//   undo 4     undo-phase-b.sql, twice: public is stage 1 again byte for byte (pg_dump -s), stage 1 rows kept, and
//              members.avatar_url cleared where its public copy was deleted (links elsewhere left as they are).
// (Release steps 3, 4, 6 and undo step 1 are Vercel's.)
//   node tests/e2e/phase-b/15-fixes-3-db.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { done, eq, ok, sleep } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const DB = `scratch_${(process.env.PHASE_B_TAG || 'bx3.').replace(/\W/g, '')}_undo`;
const STAGE2 = '20261030090000_open_invite_messages.sql';
const FIXES = '20261031090000_stage2_fixes.sql';
const MIG = (f) => `${ROOT}/supabase/migrations/${f}`;
const UNDO = `${ROOT}/release/undo-phase-b.sql`;
const LIVE = '/home/claude/build-b/qa/qb3/live';
const FIX = '/home/claude/stack/tools/fixtures';
const REST_PORT = 3263;
const sharp = createRequire(`${ROOT}/package.json`)('sharp');
const base = ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres'];
const psql = (args, db = DB) => execFileSync('psql', [...base, '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const run = (file, db = DB) => {
  try {
    return { ok: true, out: execFileSync('bash', ['-c', `psql ${base.join(' ')} -d ${db} -q -v ON_ERROR_STOP=1 -f ${file} 2>&1`], { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, out: String(err.stdout || err.message) };
  }
};
const q1 = (query) => JSON.parse(psql(['-At', '-c', `select coalesce(json_agg(t), '[]'::json) from (${query}) t`]) || '[]');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const dump = () => execFileSync('pg_dump', [...base, '-s', '-n', 'public', '--no-owner', DB], { encoding: 'utf8' }).replace(/^--.*$/gm, '').replace(/^\\(un)?restrict .*$/gm, '').replace(/\n{2,}/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bx3-undo-'));

// ---------------------------------------------------------------- the scratch database, stage 1, live-like rows
psql(['-c', `drop database if exists ${DB}`], 'postgres');
psql(['-c', `create database ${DB}`], 'postgres');
fs.writeFileSync(`${tmp}/init.sql`, fs.readFileSync(`${LIVE}/00-init-db.sql`, 'utf8').replace(/alter database qb3/g, `alter database ${DB}`));
eq(run(`${tmp}/init.sql`).ok, true, `scratch database ${DB}: auth, extensions and storage as on hosted`);
eq(run('/home/claude/stack/baseline.sql').ok, true, 'the baseline applies');
for (const f of fs.readdirSync(`${ROOT}/supabase/migrations`).filter((f) => f.endsWith('.sql') && f < STAGE2).sort()) {
  const r = run(MIG(f));
  if (!r.ok) ok(false, `stage 1 migration ${f}`, r.out.slice(0, 800));
}
const S1 = dump();
ok(S1.length > 10000, 'stage 1: every migration before stage 2 applied, its schema taken');
eq(run(`${LIVE}/01-live-rows.sql`).ok, true, 'the live-like rows: four members with old public avatars/ photos (storage.objects too)');
// Two more stage 1 members: a link outside the bucket, and a link to another member's public photo.
const EXTERNAL = 'https://lh3.example.com/a/photo.jpg';
const BORROWED = 'https://tbcpzmzfxtbaumlcnmdf.supabase.co/storage/v1/object/public/member-media/avatars/11111111-0000-4000-8000-000000000001-1760000000000.jpg';
psql(['-c', `insert into auth.users (id, email) values ('11111111-0000-4000-8000-000000000005', 'm5@live.test'), ('11111111-0000-4000-8000-000000000006', 'm6@live.test');
  insert into public.members (id, email, full_name, membership_status, avatar_url, created_at) values
  ('11111111-0000-4000-8000-000000000005', 'm5@live.test', 'Eve Elsewhere', 'active', ${lit(EXTERNAL)}, '2026-09-14'),
  ('11111111-0000-4000-8000-000000000006', 'm6@live.test', 'Fin Borrowed', 'active', ${lit(BORROWED)}, '2026-09-15');`]);
eq(run(`${LIVE}/sim-protect-delete.sql`).ok, true, 'the hosted "no DELETE on storage tables" trigger is in place');
const membersBefore = q1(`select id, avatar_url from public.members order by id`);
eq(membersBefore.length, 6, 'six stage 1 members');

// ---------------------------------------------------------------- release step 1: the two migrations
for (const f of [STAGE2, FIXES]) {
  const r = run(MIG(f));
  ok(r.ok, `release 1: ${f} applies`, r.out.split('\n').filter((l) => /ERROR/.test(l)).join('\n'));
}
eq(q1(`select public from storage.buckets where id = 'member-photos'`), [{ public: false }], 'release 1: the private member-photos bucket exists');

// ---------------------------------------------------------------- a PostgREST and a Storage API of its own
const SECRET = crypto.randomBytes(24).toString('hex');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64({ role: 'service_role', iss: 'scratch-bx3', exp: Math.floor(Date.now() / 1000) + 3600 });
const KEY = `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
const pgrst = spawn('/home/claude/stack/bin/postgrest', [], {
  env: {
    PGRST_DB_URI: `postgres://authenticator:localpw@127.0.0.1:54322/${DB}`, PGRST_DB_SCHEMAS: 'public,storage', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: SECRET,
    PGRST_SERVER_PORT: String(REST_PORT), PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions', PGRST_DB_MAX_ROWS: '1000', PATH: process.env.PATH,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
// A failed check ends the script: the PostgREST goes with it.
process.on('exit', () => {
  try {
    pgrst.kill();
  } catch {
    // gone already
  }
});
let pgrstLog = '';
pgrst.stdout.on('data', (d) => (pgrstLog += d));
pgrst.stderr.on('data', (d) => (pgrstLog += d));
let up = false;
for (let i = 0; i < 40 && !up; i += 1) {
  await sleep(250);
  up = await fetch(`http://127.0.0.1:${REST_PORT}/`, { headers: { Authorization: `Bearer ${KEY}` } }).then((r) => r.status < 500).catch(() => false);
}
ok(up, `a PostgREST of its own on ${REST_PORT}, on ${DB}`, pgrstLog.slice(-500));

// Files in memory, rows in storage.objects (as the Storage API keeps them). Only the service key gets in.
const files = new Map(); // `${bucket}/${name}` -> { bytes, type }
const asApi = (statement) => psql(['-c', `set storage.allow_delete_query = 'true'; ${statement}`]);
const bucketRow = (id) => q1(`select id, name, public from storage.buckets where id = ${lit(id)}`)[0] ?? null;
const inBucket = (bucket) => [...files.keys()].filter((k) => k.startsWith(`${bucket}/`)).map((k) => k.slice(bucket.length + 1));
const readBody = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); });
const api = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (u.pathname.startsWith('/rest/v1/')) {
    const raw = await readBody(req);
    const headers = { ...req.headers, host: `127.0.0.1:${REST_PORT}` };
    const p = http.request({ host: '127.0.0.1', port: REST_PORT, path: req.url.slice('/rest/v1'.length), method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', (e) => json(502, { message: String(e) }));
    return p.end(raw);
  }
  const p = decodeURIComponent(u.pathname.replace(/^\/storage\/v1\//, ''));
  if (p.startsWith('object/public/')) {
    const [bucket, ...rest] = p.slice('object/public/'.length).split('/');
    const f = files.get(`${bucket}/${rest.join('/')}`);
    if (!bucketRow(bucket)?.public) return json(400, { statusCode: '400', error: 'InvalidRequest', message: 'The bucket is not public' });
    if (!f) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { 'content-type': f.type });
    return res.end(f.bytes);
  }
  if (req.headers.authorization !== `Bearer ${KEY}`) return json(403, { statusCode: '403', error: 'Unauthorized', message: 'not the service key' });
  const raw = await readBody(req);
  if (p.startsWith('bucket/')) {
    const [, id, extra] = p.split('/');
    if (req.method === 'GET' && !extra) return bucketRow(id) ? json(200, bucketRow(id)) : json(404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (req.method === 'POST' && extra === 'empty') {
      for (const name of inBucket(id)) files.delete(`${id}/${name}`);
      asApi(`delete from storage.objects where bucket_id = ${lit(id)}`);
      return json(200, { message: 'Successfully emptied' });
    }
    if (req.method === 'DELETE' && !extra) {
      if (inBucket(id).length) return json(409, { statusCode: '409', error: 'InvalidRequest', message: 'The bucket you tried to delete is not empty' });
      asApi(`delete from storage.buckets where id = ${lit(id)}`);
      return json(200, { message: 'Successfully deleted' });
    }
  }
  if (p.startsWith('object/list/') && req.method === 'POST') {
    const bucket = p.slice('object/list/'.length);
    const { prefix = '', limit = 100, offset = 0 } = JSON.parse(raw.toString() || '{}');
    const under = inBucket(bucket).filter((f) => (prefix ? f.startsWith(`${prefix}/`) : true)).map((f) => (prefix ? f.slice(prefix.length + 1) : f));
    const names = [...new Set(under.map((f) => (f.includes('/') ? `${f.split('/')[0]}/` : f)))].sort();
    const items = names.map((n) => (n.endsWith('/') ? { name: n.slice(0, -1), id: null, metadata: null } : { name: n, id: crypto.createHash('md5').update(n).digest('hex'), metadata: { size: 1 } }));
    return json(200, items.slice(offset, offset + limit));
  }
  if (p.startsWith('object/')) {
    const [bucket, ...rest] = p.slice('object/'.length).split('/');
    const name = rest.join('/');
    if (req.method === 'DELETE' && !name) {
      const { prefixes = [] } = JSON.parse(raw.toString() || '{}');
      const gone = prefixes.filter((f) => files.delete(`${bucket}/${f}`));
      if (gone.length) asApi(`delete from storage.objects where bucket_id = ${lit(bucket)} and name in (${gone.map(lit).join(',')})`);
      return json(200, gone.map((n) => ({ name: n, bucket_id: bucket })));
    }
    if (req.method === 'GET') {
      const f = files.get(`${bucket}/${name}`);
      if (!f) return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      res.writeHead(200, { 'content-type': f.type });
      return res.end(f.bytes);
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!bucketRow(bucket)) return json(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      if (files.has(`${bucket}/${name}`) && req.headers['x-upsert'] !== 'true') return json(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      files.set(`${bucket}/${name}`, { bytes: raw, type: req.headers['content-type'] || 'application/octet-stream' });
      psql(['-c', `insert into storage.objects (bucket_id, name, metadata) values (${lit(bucket)}, ${lit(name)}, '{}') on conflict (bucket_id, name) do nothing`]);
      return json(200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
  }
  return json(404, { message: `not in the stand-in: ${req.method} ${p}` });
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${api.address().port}`;
const script = (name, flags = [], cwd = ROOT) => new Promise((resolve) => {
  execFile(process.execPath, [`${ROOT}/release/${name}`, ...flags], { cwd, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: KEY } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: `${stdout}${stderr}` }));
});

// The live-like public files (their storage.objects rows are in the live-like rows already).
const webp = await sharp(fs.readFileSync(`${FIX}/photo-800.jpg`)).webp().toBuffer();
const PUBLIC = {
  'avatars/11111111-0000-4000-8000-000000000001-1760000000000.jpg': [fs.readFileSync(`${FIX}/photo-800.jpg`), 'image/jpeg'],
  'avatars/11111111-0000-4000-8000-000000000002-1760000000001.png': [fs.readFileSync(`${FIX}/photo-600.png`), 'image/png'],
  'avatars/11111111-0000-4000-8000-000000000003-1760000000002.webp': [webp, 'image/webp'],
  'avatars/11111111-0000-4000-8000-000000000004-1760000000003.gif': [fs.readFileSync(`${FIX}/photo-500.gif`), 'image/gif'],
  'events/e1.jpg': [fs.readFileSync(`${FIX}/photo-480.jpg`), 'image/jpeg'],
};
for (const [name, [bytes, type]] of Object.entries(PUBLIC)) files.set(`member-media/${name}`, { bytes, type });
const member = (n) => `11111111-0000-4000-8000-00000000000${n}`;
const line = (out, id) => out.split('\n').find((l) => l.includes(id)) ?? '';

// ---------------------------------------------------------------- release step 2: the move, before the deploy
const dryMove = await script('move-member-photos.mjs');
eq(dryMove.code, 0, 'release 2: move, dry run: exit 0', dryMove.out);
ok([1, 2, 3, 4].every((n) => line(dryMove.out, member(n)).includes('would move')), 'release 2: the four members\' own photos would move');
ok(line(dryMove.out, member(5)).includes('needs a look: the photo link is not in member-media'), 'release 2: a link outside the bucket is reported');
ok(line(dryMove.out, member(6)).includes('needs a look: not their own photo file'), 'QR-02: a link to another member\'s photo is reported, not moved', line(dryMove.out, member(6)));
eq(q1('select count(*)::int n from public.member_photos')[0].n, 0, 'release 2: the dry run writes nothing');
const move = await script('move-member-photos.mjs', ['--apply']);
eq(move.code, 0, 'release 2: move --apply: exit 0', move.out);
const moved = q1(`select m.id, p.status, p.source, p.path, p.thumb_path from public.members m join public.member_photos p on p.id = m.photo_id order by m.id`);
eq(moved.map((r) => [r.id, r.status, r.source]), [1, 2, 3, 4].map((n) => [member(n), 'approved', 'migrated']), 'release 2: the four photos moved, approved, current');
eq(q1(`select id from public.members where photo_id is null order by id`).map((r) => r.id), [member(5), member(6)], 'release 2: the other two meet the photo gate');
const privateFiles = inBucket('member-photos').sort();
eq(privateFiles.length, 8, 'release 2: eight files in the private bucket (480 and 160 for each)');

// Before release step 5 the SQL undo would clear no link: every public copy is still there.
const clearBlock = /\ndo \$\$\ndeclare\n  marker constant text[\s\S]*?\nend;\n\$\$;/.exec(fs.readFileSync(UNDO, 'utf8'))?.[0];
ok(clearBlock, 'the undo\'s avatar_url block found');
fs.writeFileSync(`${tmp}/clear-only.sql`, `begin;\n${clearBlock}\nrollback;\n`);
ok(/cleared 0 link\(s\)/.test(run(`${tmp}/clear-only.sql`).out), 'before release step 5 the undo would clear no avatar_url (every public copy is there)');

// ---------------------------------------------------------------- release step 5: delete the old public copies
const dryDel = await script('delete-public-avatars.mjs');
eq(dryDel.code, 0, 'release 5: delete, dry run: exit 0', dryDel.out);
ok(Object.keys(PUBLIC).filter((f) => f.startsWith('avatars/')).every((f) => dryDel.out.includes(`would delete  ${f}`)), 'release 5: it lists the four public copies');
const del = await script('delete-public-avatars.mjs', ['--apply']);
eq(del.code, 0, 'release 5: delete --apply: exit 0', del.out);
eq(inBucket('member-media'), ['events/e1.jpg'], 'release 5: every avatars/ copy is gone (the event image stays)');
eq(q1(`select name from storage.objects where bucket_id = 'member-media' order by name`).map((r) => r.name), ['events/e1.jpg'], 'release 5: and storage.objects says so (as the Storage API keeps it)');

// ---------------------------------------------------------------- undo 2: export the private bucket
const exportDir = path.join(tmp, 'member-photos-export');
const dryUndo = await script('undo-photos-bucket.mjs');
ok(dryUndo.code === 0 && /DRY RUN \(nothing changed\): member-photos has 8 files/.test(dryUndo.out), 'undo 2: dry run: eight files, nothing changed', dryUndo.out);
const noExport = await script('undo-photos-bucket.mjs', ['--apply']);
ok(noExport.code === 2 && /REFUSED: member-photos has 8 files/.test(noExport.out), 'undo: --apply without an export is refused', noExport.out);
const inRepo = await script('undo-photos-bucket.mjs', ['--export-dir', `${ROOT}/tmp-export`]);
ok(inRepo.code === 2 && /inside the repo/.test(inRepo.out) && !fs.existsSync(`${ROOT}/tmp-export`), 'undo: an export folder inside the repo is refused (members\' photos are never one `git add` away)', inRepo.out);
eq(inBucket('member-photos').length, 8, 'undo: nothing deleted by either');
const exp = await script('undo-photos-bucket.mjs', ['--export-dir', exportDir]);
ok(exp.code === 0 && /EXPORTED: 8 files/.test(exp.out) && /Nothing was deleted/.test(exp.out), 'undo 2: --export-dir alone: eight files exported, nothing deleted', exp.out);
const same = privateFiles.every((f) => Buffer.compare(fs.readFileSync(path.join(exportDir, 'member-photos', f)), files.get(`member-photos/${f}`).bytes) === 0);
ok(same, 'undo 2: every exported file is byte for byte the private copy');
const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'manifest.json'), 'utf8'));
eq(manifest.files.map((f) => f.path).sort(), privateFiles, 'undo 2: manifest.json lists every file');
ok(manifest.files.every((f) => f.sha256 === crypto.createHash('sha256').update(files.get(`member-photos/${f.path}`).bytes).digest('hex')), 'undo 2: with each file\'s sha256');
eq(manifest.photos.map((p) => [p.member_id, p.status, p.legacy_url !== null]).sort(), [1, 2, 3, 4].map((n) => [member(n), 'approved', true]), 'undo 2: and the photo records (whose photo, status, the old link)');

// ---------------------------------------------------------------- undo 3: delete the bucket through the API
const gone = await script('undo-photos-bucket.mjs', ['--apply', '--export-dir', exportDir]);
eq(gone.code, 0, 'undo 3: --apply --export-dir: exit 0', gone.out);
ok(/EXPORTED: 8 files/.test(gone.out) && /APPLIED: removed 8 files and deleted the member-photos bucket/.test(gone.out), 'undo 3: exported again first, then every file removed and the bucket deleted', gone.out);
eq([inBucket('member-photos').length, bucketRow('member-photos')], [0, null], 'undo 3: the bucket and its files are gone (storage.buckets too)');
ok(privateFiles.every((f) => fs.existsSync(path.join(exportDir, 'member-photos', f))), 'undo 3: the export still holds every photo (now the only copy)');

// ---------------------------------------------------------------- undo 4: the SQL undo, twice
const u1 = run(UNDO);
ok(u1.ok, 'undo 4: release/undo-phase-b.sql runs (DELETE on storage refused: it deletes no storage row)', u1.out.split('\n').filter((l) => /ERROR/.test(l)).join('\n'));
ok(/cleared 5 link\(s\)/.test(u1.out), 'undo 4: it clears the five links to deleted public photos', u1.out.split('\n').filter((l) => /NOTICE/.test(l)).join('\n'));
const u2 = run(UNDO);
ok(u2.ok && /cleared 0 link\(s\)/.test(u2.out), 'undo 4: and runs again, clearing nothing more');
ok(dump() === S1, 'undo 4: public is stage 1 again, byte for byte (pg_dump -s)');
const after = q1(`select id, avatar_url from public.members order by id`);
eq(after.map((r) => r.id), membersBefore.map((r) => r.id), 'undo 4: every stage 1 member is still there');
eq(after.map((r) => r.avatar_url), [null, null, null, null, EXTERNAL, null], 'undo 4: avatar_url cleared where it pointed at a deleted public copy (also the borrowed link), the link outside the bucket kept');
eq(q1('select count(*)::int n from public.bookings')[0].n, 2, 'undo 4: the stage 1 bookings are kept');
eq(q1(`select privilege_type p from information_schema.column_privileges where table_schema = 'public' and table_name = 'members' and column_name = 'avatar_url' and grantee = 'authenticated' and privilege_type = 'UPDATE'`).length, 1, 'undo 4: stage 1\'s avatar_url grant is back (stage 1 Edit details saves photos again)');
const again = await script('undo-photos-bucket.mjs', ['--apply']);
ok(again.code === 0 && /There is no member-photos bucket: nothing to undo here/.test(again.out), 'the storage undo again: nothing to do');

// ---------------------------------------------------------------- tidy
api.close();
pgrst.kill();
await new Promise((r) => (pgrst.exitCode !== null ? r() : pgrst.on('exit', r)));
psql(['-c', `drop database if exists ${DB}`], 'postgres');
fs.rmSync(tmp, { recursive: true, force: true });
done();
