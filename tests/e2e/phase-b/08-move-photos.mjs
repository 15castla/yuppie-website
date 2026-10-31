// The release script release/move-member-photos.mjs on the local stack: a dry run changes nothing; --apply
// copies each member-media/avatars/ photo into the private bucket (480 and 160 squares), records it approved and
// migrated with the old URL, makes it the member's photo, and deletes nothing; anything odd is reported, not
// moved; a second run moves nothing; the members it moved are through the photo gate.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { done, eq, makeMember, makeMemberWithPhoto, memberSession, ok, q, rand, redirectedTo, sleep, sql, sql1, svc } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const FIX = '/home/claude/stack/tools/fixtures';
// Every run has its own email prefix, so the script sees only this run's members.
const RUN = `mv${rand()}`;
const PREFIX = `${process.env.PHASE_A_TAG}t-${RUN}`;
const run = (...flags) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [`${ROOT}/release/move-member-photos.mjs`, '--only-email-prefix', PREFIX, ...flags], { encoding: 'utf8', cwd: ROOT, env: process.env }) };
  } catch (err) {
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
};
async function withPublicAvatar(name, fixture, contentType) {
  const m = await makeMember(`${RUN}${name}`);
  const objectPath = `avatars/${m.id}-${Date.now()}.${fixture.split('.').pop()}`;
  if (fixture !== 'missing') {
    const { error } = await svc.storage.from('member-media').upload(objectPath, fs.readFileSync(`${FIX}/${fixture}`), { contentType });
    if (error) throw error;
  }
  const url = svc.storage.from('member-media').getPublicUrl(objectPath).data.publicUrl;
  await svc.from('members').update({ avatar_url: url }).eq('id', m.id);
  return { ...m, objectPath, url };
}

const jpg = await withPublicAvatar('jpg', 'photo-800.jpg', 'image/jpeg');
const png = await withPublicAvatar('png', 'photo-600.png', 'image/png');
const gif = await withPublicAvatar('gif', 'photo-500.gif', 'image/gif');
const missing = await withPublicAvatar('missing', 'missing', 'image/jpeg');
const external = await makeMember(`${RUN}ext`);
await svc.from('members').update({ avatar_url: 'https://example.com/me.jpg' }).eq('id', external.id);
const notAPhoto = await withPublicAvatar('bad', 'not-a-photo.jpg', 'image/jpeg');
const already = await makeMemberWithPhoto(`${RUN}has`);
await svc.from('members').update({ avatar_url: jpg.url }).eq('id', already.id);
ok([jpg, png, gif, missing, external, notAPhoto, already].every((m) => m.email.startsWith(PREFIX)), `test members are ${PREFIX}...`);
const lineFor = (out, m) => out.split('\n').find((l) => l.includes(m.id)) ?? '';

// ---------------------------------------------------------------- dry run
const dry = run();
eq(dry.code, 0, 'dry run: exit 0');
ok(dry.out.startsWith('DRY RUN (nothing changed): 7 members'), 'it says it is a dry run, for the 7 members with a link', dry.out.split('\n')[0]);
for (const m of [jpg, png, gif]) ok(lineFor(dry.out, m).includes('would move'), `would move ${m.email.split('@')[0]}`);
ok(lineFor(dry.out, missing).includes('needs a look: the file is missing'), 'a missing file: needs a look');
ok(lineFor(dry.out, external).includes('needs a look: the photo link is not in member-media'), 'a link elsewhere: needs a look');
ok(lineFor(dry.out, notAPhoto).includes('needs a look: the file is not a photo'), 'a file that is not a photo: needs a look');
ok(lineFor(dry.out, already).includes('skipped: has a photo already'), 'a member with a stage 2 photo: left alone');
eq(sql1(`select count(*)::int n from member_photos where source = 'migrated' and member_id in (${[jpg, png, gif].map((m) => q(m.id)).join(',')})`).n, 0, 'and nothing was recorded');
eq(sql(`select photo_id from members where id in (${[jpg, png, gif].map((m) => q(m.id)).join(',')})`).every((r) => r.photo_id === null), true, 'nor linked');

// ---------------------------------------------------------------- apply
const applied = run('--apply');
eq(applied.code, 0, '--apply: exit 0 (nothing failed)');
ok(/^APPLIED: 7 members/.test(applied.out) && /sharp: yes/.test(applied.out), 'it applied, resizing with sharp', applied.out.split('\n')[0]);
for (const m of [jpg, png, gif]) {
  const row = sql1(`select p.id, p.status, p.source, p.legacy_url, p.path, p.thumb_path, p.resized, m.photo_id = p.id as current from member_photos p join members m on m.id = p.member_id where p.member_id = ${q(m.id)}`);
  eq([row?.status, row?.source, row?.legacy_url, row?.resized, row?.current], ['approved', 'migrated', m.url, true, true], `${m.email.split('@')[0]}: approved, migrated, with the old URL, current`);
  ok(fs.existsSync(`/home/claude/stack/storage/member-photos/${row.path}`) && fs.existsSync(`/home/claude/stack/storage/member-photos/${row.thumb_path}`), '  its 480 and 160 files are in the private bucket');
  ok(fs.existsSync(`/home/claude/stack/storage/member-media/${m.objectPath}`), '  the public copy is still there (nothing deleted)');
  eq(sql1(`select avatar_url from members where id = ${q(m.id)}`).avatar_url, m.url, '  and avatar_url is unchanged');
}
for (const m of [missing, external, notAPhoto]) eq(sql1(`select photo_id from members where id = ${q(m.id)}`).photo_id, null, `${m.email.split('@')[0]}: not moved (reported)`);
ok(/Totals: .*moved 3/.test(applied.out) && /needs a look 3/.test(applied.out), 'the totals', applied.out.split('\n').find((l) => l.startsWith('Totals')));

// ---------------------------------------------------------------- again, and the gate
const again = run('--apply');
for (const m of [jpg, png, gif]) ok(lineFor(again.out, m).includes('already moved'), `a second run: ${m.email.split('@')[0]} already moved`);
eq(sql1(`select count(*)::int n from member_photos where source = 'migrated' and member_id in (${[jpg, png, gif].map((m) => q(m.id)).join(',')})`).n, 3, 'no second copy');
// The release script ran synchronously (the event loop was blocked for seconds): let the HTTP client see the
// keep-alive sockets the gateway closed meanwhile, or its next call reuses a dead one ("fetch failed" under load).
await sleep(300);
const s = await memberSession(jpg.email);
eq(await redirectedTo('/members/open-invite', s), null, 'a moved member is through the photo gate');
eq(await redirectedTo('/members/open-invite', await memberSession(missing.email)), '/members/photo', 'a member whose photo could not be moved meets the gate (as decision 4 A says)');
done();
