// The Concierge's server-side rules (lib/server/concierge-rules.ts), run directly with Node (type stripping).
//   node tests/e2e/concierge/00-rules.mjs
import { houseStyle, isBadFact, offersToBook, plain, rememberable } from '../../../lib/server/concierge-rules.ts';

let n = 0;
let failed = 0;
const check = (cond, label) => { n++; if (cond) console.log(`ok   ${label}`); else { failed++; console.log(`FAIL ${label}`); } };

const offers = [
  'I’ll book you a table at Calder & Co.', 'I can book it for you.', 'Would you like me to book it?', 'Shall I make a reservation?',
  'I’d be happy to book for you.', 'I can make a booking for Friday.', 'Should I book a table?', 'I’ll grab you a table.',
  'I could ring them for you.', 'Want me to try and book?', 'I can get you in at 8.', 'Let me reserve the round table.',
  'I’ve booked you in for 19:00.', 'We have reserved a table.', 'I will call the restaurant.', 'Do you want me to call them?',
  'I’ll go ahead and book it.', 'Let me email them for you.', 'I can secure a table.', 'I’ll get you a table by the window.',
];
for (const t of offers) check(offersToBook(t), `an offer: "${t}"`);
const advice = [
  'Once you’ve booked it, ask for the window table.', 'If you have booked a table, arrive early.', 'Let me call out the terrace.',
  'I’ll call this one the wildcard.', 'Ring ahead and ask for the round table.', 'Book on their website, it fills up by Wednesday.',
  'Book early for Saturdays.', 'Ask for the table by the fire when you book.', 'They take bookings for eight or more.',
  'Walk-ins go early, so ring ahead.', 'I’d try the upstairs room.', 'I’d go for the set menu.', 'You can book online.',
  'Call them in the morning, that’s when they answer.', 'I can recommend the Sunday roast.',
];
for (const t of advice) check(!offersToBook(t), `advice, not an offer: "${t}"`);

for (const f of ['Book for 19:30', '7pm sitting', '£35 a head', 'Table for six', 'Reservations only']) check(isBadFact(f), `not a fact: "${f}"`);
for (const f of ['Good for four', 'Quiet upstairs', 'Garden', 'Walk-ins welcome', 'Open late', 'Dog friendly']) check(!isBadFact(f), `a fact: "${f}"`);

check(houseStyle('Great news — two places! 🎉', 100) === 'Great news, two places.', 'house style: dash, exclamation and emoji go');
check(houseStyle('Mon–Fri only!', 100) === 'Mon, Fri only.', 'house style: running copy (names and addresses are not run through it)');
check(plain('Yo! Sushi', 60) === 'Yo! Sushi', 'a name keeps its own spelling');
check(plain('  12 High   Street, London N1  ', 120) === '12 High Street, London N1', 'an address is tidied');

for (const m of ['Likes quiet places', 'Vegetarian', 'Usually four of them', 'Prefers Thursdays', 'Likes a garden', 'Budget about mid-range']) check(rememberable(m), `remembered: "${m}"`);
for (const m of ['Allergic to nuts', 'Coeliac', 'Halal only', 'Is pregnant', 'Uses a wheelchair', 'Has anxiety in crowds', 'Sober', 'x'.repeat(61), '']) check(!rememberable(m), `not remembered: "${m.slice(0, 30)}"`);

console.log(failed ? `FAIL 00-rules.mjs: ${failed} of ${n}` : `PASS 00-rules.mjs: ${n} checks`);
process.exit(failed ? 1 : 0);
