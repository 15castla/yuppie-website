// The privacy policy (components/site/privacy-data.ts): the public page and the app's copy say the same up-to-date
// things, with a fixed date and the company; the house style holds. Same server as 01.
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, rand } from '../phase-b/lib.mjs';

const pub = await (await fetch(`${BASE}/privacy`)).text();
const M = await makeMemberWithPhoto(`pp${rand()}`);
const app = await (await fetch(`${BASE}/members/you/help/privacy`, { headers: { cookie: cookieFor(M.session) } })).text();
const plain = (html) => html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;/g, '’').replace(/\s+/g, ' ');
for (const [name, html] of [['public', pub], ['app', app]]) {
  const t = plain(html);
  for (const must of ['3 November 2026', 'Club Yuppie Ltd', '17530492', '45 Albemarle Street', 'Anthropic', 'Twilio', 'Vercel', 'Supabase', 'Stripe', 'Resend', 'photo', 'Open Invite', 'Concierge', 'ico.org.uk']) {
    ok(t.includes(must), `${name}: mentions ${must}`);
  }
  ok(!t.includes('Westmoreland'), `${name}: not the old address`);
  ok(!t.includes('personal data Yuppie'), `${name}: "Club Yuppie", never bare "Yuppie", as "we"`);
}
const src = (await import('node:fs')).readFileSync('/home/claude/co/components/site/privacy-data.ts', 'utf8') + (await import('node:fs')).readFileSync('/home/claude/co/components/site/rules-data.ts', 'utf8');
ok(!src.includes('—') && !/[^\\]!/.test(src.replace(/!==?|!\w|!\(/g, '')), 'house style: no em dashes, no exclamation marks');
done();
