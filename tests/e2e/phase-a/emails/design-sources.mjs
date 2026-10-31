// Where each email's design lives, and the few documented differences
// between the design's example and what the code sends (used by
// check-emails.mjs and shoot-emails.mjs).
//
// - Links: the designs draw /members/notifications and /members/invite/…;
//   the routes are /members/you/notifications (ROUTES.youNotifications) and
//   /members/open-invite/… (ROUTES.openInvite). Same pixels.
// - plan-cancelled: the drawn serif line "The walk’s off." is the example's
//   (a walk); any plan says "The plan’s off.". One word, so the pixel
//   comparison shoots the email with the drawn word put back.
import path from 'node:path';

export const DESIGN = '/home/claude/rebrand/v4/out';
export const V3 = '/home/claude/rebrand/v3/out';

const SITE = 'https://clubyuppie.com';

/** Our links as the design drew them. */
export function toDrawnLinks(s) {
  return s
    .replaceAll(`${SITE}/members/you/notifications`, `${SITE}/members/notifications`)
    .replaceAll(`${SITE}/members/open-invite`, `${SITE}/members/invite`);
}

/** Our words as the design's example drew them (only where the example is specific to its content). */
export function toDrawnWords(name, s) {
  if (name === 'plan-cancelled') return s.replace('The plan’s off.', 'The walk’s off.');
  return s;
}

/**
 * The design of each email:
 * - { kind: 'send', html, text }: the r2c send-ready files (byte for byte);
 * - { kind: 'v3', file }: a round 3 email, copied into r2c unchanged. Its markup is the older shell (forced light,
 *   other class names), so the html is the r2c shell with the round 3 words and the text part is compared byte for
 *   byte with the round 3 plain-text part (<pre>).
 */
export function designOf(name) {
  const v3 = {
    'event-reminder': path.join(V3, 'notif-email-reminder-event.html'),
    'plan-reminder': path.join(DESIGN, 'r2c-v3-notif-email-reminder-plan.html'),
    'new-message': path.join(DESIGN, 'r2c-v3-msg-email-new-message.html'),
  }[name];
  if (v3) return { kind: 'v3', file: v3 };
  return { kind: 'send', html: path.join(DESIGN, `r2c-send-${name}.html`), text: path.join(DESIGN, `r2c-send-${name}.txt`) };
}

/** The round 3 subject and preheader (the review file's preview frame), for the v3 emails. */
export const V3_SUBJECTS = {
  'event-reminder': ['Tomorrow, 18:30: Padel & Pints', 'Northgate Courts. Your booking is below.'],
  'plan-reminder': ['Tomorrow, 10:00: Saturday morning class + brunch', 'Psycle, Oxford Circus. Jasmin and Priya are going too.'],
  'new-message': ['New message in Saturday morning class + brunch', 'Log in to read it. We never put messages in emails.'],
};

/**
 * The texts as the r2c "Texts" table writes them, with their counts (characters, encoding, parts), keyed
 * name/fixture. The reminders-on link is the route (/members/you/notifications): the table's words with that link.
 */
export const DRAWN_TEXTS = {
  'welcome/design': ['Club Yuppie: You’re in. Log in: clubyuppie.com/member-login', 59, 'Unicode', 1],
  'reminders-on/design': ['Club Yuppie: reminders by text are on. Turn them off any time at clubyuppie.com/members/notifications', 101, 'Standard', 1],
  'event-reminder/design': ['Club Yuppie: Padel & Pints is tomorrow at 18:30, Northgate Courts. See your booking: clubyuppie.com/members', 107, 'Standard', 1],
  'event-reminder/2h': ['Club Yuppie: Padel & Pints starts in 2 hours, 18:30, Northgate Courts. See your booking: clubyuppie.com/members', 111, 'Standard', 1],
  'plan-reminder/design': ['Club Yuppie: Saturday morning class + brunch is tomorrow at 10:00, Psycle, Oxford Circus. See the plan: clubyuppie.com/members', 126, 'Standard', 1],
  'plan-reminder/2h': ['Club Yuppie: Saturday morning class + brunch starts in 2 hours, 10:00, Psycle, Oxford Circus. See the plan: clubyuppie.com/members', 130, 'Standard', 1],
};

/** Our text as the table drew it. */
export function textToDrawn(s) {
  return s.replace('clubyuppie.com/members/you/notifications', 'clubyuppie.com/members/notifications');
}
