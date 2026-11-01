// Sample Open Invites (Albert, 1 Nov 2026: "previously we had loads of fake open invites listed - pls could you do
// this again, as I want to see the look"). INVENTED people and plans, for looking at the app and for App Store
// screenshots while the club has no real members. Remove them before the first real member is approved:
//
//   node release/sample-open-invites.mjs                    # dry run: says what it would add (or what is there)
//   node release/sample-open-invites.mjs --apply            # adds them, or moves the plans back to upcoming dates
//   node release/sample-open-invites.mjs --remove           # dry run of the removal
//   node release/sample-open-invites.mjs --remove --apply   # removes every sample member, plan, chat and photo
//
// Run from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
//
// What it adds:
//   * nine sample members, "Sam (sample)" and so on, with emails sample.<name>@clubyuppie.invalid (the .invalid
//     domain can never receive mail). Their logins are banned, so nobody can sign in as them. Every notification
//     switch is off for them, so nothing is ever emailed or texted to them, and the reminders job skips them.
//     They appear in Admin > Members (with "(sample)" in the name). Members see only the first name.
//   * their photos: heads from the club's own group drawing, recoloured (the same set the approved designs used),
//     in the private member-photos bucket at <member id>/sample-<letter>-full.jpg and -thumb.jpg, approved.
//   * fourteen free plans over the next three weeks, posted and joined through the same database functions the app
//     uses (post_plan, join_plan), so places, chats and "is in" lines are all as real; one is full.
//   * a few chat messages between the sample members in four of the plan chats.
// The functions send nothing (the app's notification dispatcher is never called), so nobody is told anything.
//
// Running --apply again is safe: it finds what is there, adds what is missing, and moves the sample plans back to
// their upcoming dates (run it again if the plans have passed). It never touches a real member's row.
//
// What --remove does: deletes the sample members' photo files, then their logins. The database removes the rest
// with them (their member rows, photos, plans, the plan chats and messages, places and Updates about those plans,
// including any a real member joined or sent). Nothing else is touched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPA || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.');
  process.exit(1);
}
const db = createClient(SUPA, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// fileURLToPath, not URL.pathname: a folder name with a space ("Yuppie Website") is %20 in a URL's pathname.
const PHOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-photos');
const DOMAIN = '@clubyuppie.invalid';
const isSample = (email) => typeof email === 'string' && email.startsWith('sample.') && email.endsWith(DOMAIN);

const PEOPLE = [
  ['S', 'Sam'], ['J', 'Jasmin'], ['P', 'Priya'], ['T', 'Tom'], ['M', 'Marcus'],
  ['A', 'Aisha'], ['D', 'Dan'], ['C', 'Chloe'], ['O', 'Ollie'],
];

// day: 0 Sunday .. 6 Saturday; week: 0 the coming one, 1 the one after, 2 the one after that.
const PLANS = [
  { title: 'Saturday morning spin and brunch', type: 'Wellness', day: 6, week: 0, at: '10:00', place: 'The Ride Room, Soho', places: 4, host: 'Jasmin', going: ['Priya', 'Sam'],
    note: 'Booked the 10:00 ride. Brunch afterwards round the corner. Beginners welcome.' },
  { title: 'Sunday walk and coffee', type: 'Wellness', day: 0, week: 0, at: '11:00', place: 'Calder Park', places: 6, host: 'Priya', going: ['Aisha'],
    note: 'Gentle loop, about an hour, then coffee.' },
  { title: 'Padel, then pizza', type: 'Sport', day: 2, week: 0, at: '19:00', place: 'Northgate Courts', places: 4, host: 'Tom', going: ['Dan', 'Chloe'],
    note: 'Doubles, all levels. Spare rackets if you need one.' },
  { title: 'Climbing and a pint', type: 'Sport', day: 3, week: 0, at: '18:30', place: 'The Boulder Yard', places: 4, host: 'Sam', going: ['Tom', 'Chloe', 'Ollie'],
    note: 'Beginners welcome, shoes can be hired at the desk.' },
  { title: 'Gallery late and a drink', type: 'Culture', day: 4, week: 0, at: '18:30', place: 'Marlow Gallery', places: 4, host: 'Aisha', going: [],
    note: 'Late opening, then a drink round the corner. Come on your own or with a friend.' },
  { title: 'Comedy night, two spare tickets', type: 'Culture', day: 5, week: 0, at: '20:00', place: 'The Bell Room', places: 3, host: 'Dan', going: [],
    note: 'Two spare tickets for the late show. Drinks after if you’re up for it.' },
  { title: '5km by the river, then breakfast', type: 'Sport', day: 6, week: 1, at: '08:00', place: 'Calder Park', places: 8, host: 'Marcus', going: ['Ollie', 'Priya', 'Dan'],
    note: 'Easy pace, nobody gets left behind. Breakfast at the café by the bridge.' },
  { title: 'Pilates and juice', type: 'Wellness', day: 6, week: 1, at: '09:30', place: 'Studio Nine', places: 6, host: 'Aisha', going: ['Jasmin'],
    note: 'Mat class for all levels, then fresh juice next door.' },
  { title: 'Tennis doubles', type: 'Sport', day: 0, week: 1, at: '10:00', place: 'Riverside Courts', places: 4, host: 'Ollie', going: ['Tom'],
    note: 'Friendly doubles, an hour on court. I’ll bring balls.' },
  { title: 'Five-a-side', type: 'Sport', day: 2, week: 1, at: '19:00', place: 'Canal Street Pitches', places: 10, host: 'Tom', going: ['Marcus', 'Ollie', 'Dan', 'Sam'],
    note: 'Friendly game, bibs provided. Pub after.' },
  { title: 'Jazz night', type: 'Culture', day: 3, week: 1, at: '20:00', place: 'Low Note', places: 4, host: 'Priya', going: [],
    note: 'Live trio from 20:00. I’ll get us a table near the front.' },
  { title: 'Supper club for six', type: 'Food and drink', day: 4, week: 1, at: '19:30', place: 'Hollis & Vine', places: 6, host: 'Chloe', going: ['Jasmin', 'Marcus'],
    note: 'Set menu, one long table. Tell me about allergies once you’re in.' },
  { title: 'Wine tasting, then dinner', type: 'Food and drink', day: 5, week: 1, at: '19:00', place: 'The Cellar Rooms', places: 8, host: 'Jasmin', going: ['Aisha', 'Sam', 'Priya', 'Chloe'],
    note: 'Six wines and a few stories from the owner, then dinner nearby.' },
  { title: 'Sunday roast', type: 'Food and drink', day: 0, week: 2, at: '13:30', place: 'The Feathers', places: 6, host: 'Marcus', going: ['Dan'],
    note: 'Long lunch, big table by the fire. Stay as long as you like.' },
];

const CHATS = {
  'Climbing and a pint': [
    ['Sam', 'Booked us a wall for 18:30. Meet at the front desk.'],
    ['Chloe', 'First time climbing, be gentle.'],
    ['Tom', 'Same here. Pint for whoever makes it to the top first.'],
    ['Ollie', 'See you all on Wednesday.'],
  ],
  'Saturday morning spin and brunch': [
    ['Jasmin', 'Brunch table booked for 11:15.'],
    ['Priya', 'Perfect, see you at the studio.'],
  ],
  'Wine tasting, then dinner': [
    ['Aisha', 'Can’t wait. Is there a dress code?'],
    ['Jasmin', 'Whatever you’d wear to dinner.'],
    ['Chloe', 'I’ll be ten minutes late, start without me.'],
  ],
  'Padel, then pizza': [
    ['Dan', 'I’ve got a spare racket if anyone needs one.'],
    ['Tom', 'Court 3, see you there.'],
  ],
};

// ---------------------------------------------------------------- dates: a London wall-clock time on a given day
function londonAt(date, hh, mm) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const guess = new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const [h] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(guess).split(':').map(Number);
  return new Date(guess.getTime() - (h - hh) * 3600000);
}
function startsAt({ day, week, at }) {
  const now = new Date();
  const todayDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(now));
  let ahead = (day - todayDow + 7) % 7;
  if (ahead < 2) ahead += 7;                                // never today or tomorrow: always comfortably upcoming
  const [hh, mm] = at.split(':').map(Number);
  return londonAt(new Date(now.getTime() + (ahead + week * 7) * 86400000), hh, mm).toISOString();
}

// ---------------------------------------------------------------- helpers
async function sampleUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users.filter((u) => isSample(u.email)));
    if (data.users.length < 1000) return out;
  }
}
async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}
const say = (...a) => console.log(...a);

// ---------------------------------------------------------------- remove
async function remove() {
  const users = await sampleUsers();
  say(`${users.length} sample member${users.length === 1 ? '' : 's'} found${users.length ? ': ' + users.map((u) => u.email).join(', ') : ''}.`);
  if (!users.length) return;
  const ids = users.map((u) => u.id);
  const { data: plans } = await db.from('plans').select('id, title').in('host_id', ids);
  const { data: realIn } = await db.from('plan_members').select('member_id, plan_id').in('plan_id', (plans ?? []).map((p) => p.id)).not('member_id', 'in', `(${ids.join(',')})`);
  say(`${plans?.length ?? 0} sample plans would go with them.`);
  if (realIn?.length) say(`${realIn.length} place(s) a real member took in a sample plan go too (their chat with it, and its Updates).`);
  if (!APPLY) { say('Dry run: nothing changed. Add --apply to remove.'); return; }
  for (const u of users) {
    const { data: files } = await db.storage.from('member-photos').list(u.id, { limit: 100 });
    const paths = (files ?? []).map((f) => `${u.id}/${f.name}`);
    if (paths.length) {
      const { error } = await db.storage.from('member-photos').remove(paths);
      if (error) throw new Error(`photo files for ${u.email}: ${error.message}`);
    }
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`login for ${u.email}: ${error.message}`);
    say(`removed ${u.email} (${paths.length} photo files)`);
  }
  const left = await sampleUsers();
  const { count } = await db.from('members').select('id', { count: 'exact', head: true }).like('email', `sample.%${DOMAIN}`);
  say(left.length === 0 && count === 0 ? 'Done: no sample member, plan or photo is left.' : `Check: ${left.length} logins and ${count} member rows still match.`);
}

// ---------------------------------------------------------------- add
async function add() {
  const existing = new Map((await sampleUsers()).map((u) => [u.email, u]));
  const ids = {};
  for (const [letter, name] of PEOPLE) {
    const email = `sample.${name.toLowerCase()}${DOMAIN}`;
    let user = existing.get(email);
    if (!user) {
      if (!APPLY) { say(`would add member ${name} (${email})`); continue; }
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, ban_duration: '876000h' });
      if (error) throw new Error(`login for ${email}: ${error.message}`);
      user = data.user;
      say(`added login ${email} (banned: nobody can sign in)`);
    } else say(`member ${name} is there`);
    ids[name] = user.id;
    if (!APPLY) continue;
    await db.auth.admin.updateUserById(user.id, { ban_duration: '876000h' });
    const { data: real } = await db.from('members').select('id, email').eq('id', user.id).maybeSingle();
    if (real && !isSample(real.email)) throw new Error(`refusing: member ${user.id} is not a sample member`);
    let { error } = await db.from('members').upsert({ id: user.id, email, full_name: `${name} (sample)`, membership_status: 'active' });
    if (error) throw new Error(`member ${name}: ${error.message}`);
    ({ error } = await db.from('notification_preferences').upsert({
      member_id: user.id, topic_host: false, topic_in: false, topic_reminder24: false, topic_reminder2: false, topic_club_changes: false,
      channel_push: false, channel_email: false, channel_text: false,
    }, { onConflict: 'member_id' }));
    if (error) throw new Error(`switches for ${name}: ${error.message}`);
    const full = `${user.id}/sample-${letter}-full.jpg`;
    const thumb = `${user.id}/sample-${letter}-thumb.jpg`;
    for (const [p, f] of [[full, `${letter}-480.jpg`], [thumb, `${letter}-160.jpg`]]) {
      const { error: e } = await db.storage.from('member-photos').upload(p, fs.readFileSync(path.join(PHOTOS, f)), { contentType: 'image/jpeg', upsert: true });
      if (e) throw new Error(`photo ${p}: ${e.message}`);
    }
    const now = new Date().toISOString();
    const { data: photo, error: pe } = await db.from('member_photos').upsert({
      member_id: user.id, path: full, thumb_path: thumb, width: 480, height: 480, content_type: 'image/jpeg',
      bytes: fs.statSync(path.join(PHOTOS, `${letter}-480.jpg`)).size, resized: true, source: 'new', face_check: 'skipped',
      status: 'approved', reviewed_at: now,
    }, { onConflict: 'path' }).select('id').single();
    if (pe) throw new Error(`photo row ${name}: ${pe.message}`);
    await db.from('members').update({ photo_id: photo.id }).eq('id', user.id);
  }
  if (!APPLY) {
    say(`would add or refresh ${PLANS.length} plans: ${PLANS.map((p) => p.title).join('; ')}`);
    say('Dry run: nothing changed. Add --apply to add them.');
    return;
  }
  for (const spec of PLANS) {
    const host = ids[spec.host];
    const when = startsAt(spec);
    const { data: found } = await db.from('plans').select('id, status').eq('host_id', host).eq('title', spec.title).order('created_at', { ascending: true }).limit(1);
    let id = found?.[0]?.id;
    if (!id) {
      id = (await rpc('post_plan', { p_host: host, p_title: spec.title, p_type: spec.type, p_starts_at: when, p_place: spec.place, p_note: spec.note, p_places: spec.places, p_host_going: true })).plan_id;
      say(`posted "${spec.title}" (${spec.host}, ${when})`);
    } else {
      const { error } = await db.from('plans').update({ starts_at: when, status: 'scheduled', cancelled_at: null }).eq('id', id);
      if (error) throw new Error(`moving "${spec.title}": ${error.message}`);
      say(`"${spec.title}" is there, moved to ${when}`);
    }
    for (const who of spec.going) {
      const { data: pm } = await db.from('plan_members').select('status').eq('plan_id', id).eq('member_id', ids[who]).maybeSingle();
      if (pm?.status === 'going') continue;
      const r = await rpc('join_plan', { p_member: ids[who], p_plan: id });
      if (r && r.ok === false) say(`  ${who} could not join "${spec.title}": ${JSON.stringify(r)}`);
    }
    const lines = CHATS[spec.title] ?? [];
    if (lines.length) {
      const { data: chat } = await db.from('chats').select('id').eq('plan_id', id).eq('kind', 'plan').single();
      for (const [i, [who, body]] of lines.entries()) {
        const clientId = `sample-${i}`;
        const { data: has } = await db.from('messages').select('id').eq('chat_id', chat.id).eq('client_id', clientId).maybeSingle();
        if (has) continue;
        const { error } = await db.from('messages').insert({ chat_id: chat.id, kind: 'text', sender_id: ids[who], body, client_id: clientId });
        if (error) throw new Error(`message in "${spec.title}": ${error.message}`);
      }
    }
  }
  const { count } = await db.from('plans').select('id', { count: 'exact', head: true }).in('host_id', Object.values(ids)).eq('status', 'scheduled').gt('starts_at', new Date().toISOString());
  say(`Done: ${Object.keys(ids).length} sample members, ${count} upcoming sample plans.`);
}

if (REMOVE) await remove();
else await add();
