// Screenshots of the notifications, photo and Blocked members screens as members see them: the real pages on this
// build (PHASE_B_BASE), real logins, every state reachable on the local stack, at 320, 390, 430, 768, 1024 and 1280,
// web and app. Phones at 2x, wider at 1x, full page. Writes <out>/<state>-<web|app>-<width>.png (default out:
// /home/claude/build-b/shots/b-notif). Not part of run-all (no checks); it prints each file.
// A line ends "OVERFLOW scrollWidth N" when the page scrolls sideways at that width.
//   [MODES=web|app] [WIDTHS=320,390] node tests/e2e/phase-b/shoot-12.mjs [state ...]
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { loginMember } from '/home/claude/stack/tools/login.mjs';
import { BASE, action, exec, makeMember, makeMemberWithPhoto, q } from './lib.mjs';

const OUT = process.env.SHOTS_OUT || '/home/claude/build-b/shots/b-notif';
const FIX = '/home/claude/stack/tools/fixtures';
const WIDTHS = (process.env.WIDTHS || '320,390,430,768,1024,1280').split(',').map(Number);
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const NO_FACE = 'window.FaceDetector = class { async detect() { return []; } };';

// One real login per member; the 1x context (computer widths) carries the same session cookies.
async function session(email, mode, { init = null } = {}) {
  const contexts = {};
  let storageState;
  for (const dpr of [2, 1]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, userAgent: mode === 'app' ? APP_UA : undefined, storageState });
    if (init) await ctx.addInitScript(init);
    const pg = await ctx.newPage();
    if (!storageState) {
      await loginMember(pg, BASE, email);
      storageState = await ctx.storageState();
    }
    contexts[dpr] = { ctx, pg };
  }
  return { contexts };
}
const hydrated = async (pg) => {
  // Hydrated before anything is tapped; a busy shared server can keep the network going, so this waits at most 10s.
  await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => pg.waitForTimeout(1500));
  await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 30000 });
  await pg.evaluate(() => document.fonts.ready);
};

/** Shoot one state: `go(pg)` puts the page in the state at the current width. */
async function shoot(state, mode, who, go, { full = true } = {}) {
  if (only.length && !only.includes(state)) return;
  for (const width of WIDTHS) {
    const { pg } = who.contexts[width < 768 ? 2 : 1];
    await pg.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await go(pg, width);
    await pg.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
    await pg.waitForTimeout(350);
    const file = `${OUT}/${state}-${mode}-${width}.png`;
    const scroll = await pg.evaluate(() => document.documentElement.scrollWidth);
    await pg.screenshot({ path: file, fullPage: full });
    console.log(scroll > width ? `${file} OVERFLOW scrollWidth ${scroll}` : file);
  }
}
const open = (path) => async (pg) => {
  await pg.goto(`${BASE}${path}`);
  await hydrated(pg);
};
// The phone and computer layouts can both carry the words (one hidden): wait for the visible one.
const text = async (pg, words) => pg.getByText(words, { exact: false }).locator('visible=true').first().waitFor({ timeout: 20000 });

try {
  for (const mode of (process.env.MODES || 'web,app').split(',')) {
    // ---------------------------------------------------------------- Notifications
    const nt = await makeMemberWithPhoto(`shn${mode}`);
    const ntS = await session(nt.email, mode);
    await shoot('notif-default', mode, ntS, open('/members/you/notifications'));
    await action('notifications.setNotificationChannel', ['text', true], nt.session);
    await shoot('notif-texton', mode, ntS, open('/members/you/notifications'));
    await shoot('notif-error', mode, ntS, async (pg) => {
      await open('/members/you/notifications')(pg);
      const route = (url) => url.pathname === '/members/you/notifications';
      await pg.route(route, (r) => (r.request().method() === 'POST' ? r.abort('failed') : r.continue()));
      await pg.getByRole('switch', { name: '24 hours before', exact: true }).click();
      await text(pg, 'Couldn’t save that.');
      await pg.unroute(route);
    });
    await shoot('you-settings', mode, ntS, open('/members/you'));
    const nn = await makeMemberWithPhoto(`shnn${mode}`, 'active', { phone: null });
    await shoot('notif-nonumber', mode, await session(nn.email, mode), open('/members/you/notifications'));

    // ---------------------------------------------------------------- the photo gate
    const g = await makeMember(`shg${mode}`);
    const gS = await session(g.email, mode);
    const gate = open('/members/photo');
    const chosen = async (pg, file = 'photo-800.jpg') => {
      await gate(pg);
      await pg.locator('input[type=file]').first().setInputFiles(`${FIX}/${file}`);
    };
    await shoot('gate-start', mode, gS, gate);
    await shoot('gate-small', mode, gS, async (pg) => {
      await chosen(pg, 'photo-200.jpg');
      await text(pg, 'Too small.');
    });
    await shoot('gate-crop', mode, gS, async (pg) => {
      await chosen(pg);
      await text(pg, 'Fit your face in the circle.');
    });
    await shoot('gate-preview', mode, gS, async (pg) => {
      await chosen(pg);
      await text(pg, 'Fit your face in the circle.');
      await pg.getByRole('button', { name: 'Next' }).click();
      await text(pg, 'This is how members see you.');
    });
    if (mode === 'app') {
      await shoot('gate-camera-ask', mode, gS, async (pg) => {
        await gate(pg);
        await pg.evaluate(() => localStorage.removeItem('yuppie-camera-asked'));
        // In the dock on a phone, under the words from 768px.
        await pg.getByRole('button', { name: 'Take a photo', exact: true }).locator('visible=true').last().click();
        await text(pg, 'We need the camera to take your photo.');
      });
    }
    await shoot('gate-saved', mode, gS, async (pg) => {
      exec(`update members set photo_id = null where id = ${q(g.id)}; delete from member_photos where member_id = ${q(g.id)}`);
      await chosen(pg);
      await text(pg, 'Fit your face in the circle.');
      await pg.getByRole('button', { name: 'Next' }).click();
      await pg.getByRole('button', { name: 'Save photo' }).click();
      await text(pg, 'Your photo is on.');
    });
    const nf = await makeMember(`shf${mode}`);
    const nfS = await session(nf.email, mode, { init: NO_FACE });
    await shoot('gate-noface', mode, nfS, async (pg) => {
      await pg.goto(`${BASE}/members/photo`);
      await hydrated(pg);
      await pg.locator('input[type=file]').first().setInputFiles(`${FIX}/photo-800.jpg`);
      await text(pg, 'Fit your face in the circle.');
      await pg.getByRole('button', { name: 'Next' }).click();
      await text(pg, 'This doesn’t look like a photo of you.');
    });
    const rm = await makeMemberWithPhoto(`shr${mode}`);
    exec(`update member_photos set status = 'removed', removal_reason = 'not_clear', removed_at = now() where id = ${q(rm.photoId)}; update members set photo_id = null where id = ${q(rm.id)}`);
    await shoot('gate-removed', mode, await session(rm.email, mode), gate);

    // ---------------------------------------------------------------- Change photo (a sheet over You)
    const cp = await makeMemberWithPhoto(`shc${mode}`);
    const cpS = await session(cp.email, mode, { init: NO_FACE });
    const sheet = async (pg) => {
      await open('/members/you/photo')(pg);
      await pg.locator('dialog[open]').waitFor();
    };
    await shoot('change-start', mode, cpS, sheet, { full: false });
    if (mode === 'app') {
      await shoot('change-camera-ask', mode, cpS, async (pg) => {
        await sheet(pg);
        await pg.evaluate(() => localStorage.removeItem('yuppie-camera-asked'));
        await pg.locator('dialog[open]').getByRole('button', { name: 'Take a photo' }).click();
        await text(pg, 'We need the camera to take your photo.');
      }, { full: false });
    }
    await shoot('change-crop', mode, cpS, async (pg) => {
      await sheet(pg);
      await pg.locator('dialog[open] input[type=file]').first().setInputFiles(`${FIX}/photo-800.jpg`);
      await text(pg, 'Fit your face in the circle.');
    }, { full: false });
    await shoot('change-noface', mode, cpS, async (pg) => {
      await sheet(pg);
      await pg.locator('dialog[open] input[type=file]').first().setInputFiles(`${FIX}/photo-800.jpg`);
      await text(pg, 'Fit your face in the circle.');
      await pg.getByRole('button', { name: 'Use this photo' }).click();
      await text(pg, 'This doesn’t look like a photo of you.');
    }, { full: false });
    await shoot('you-photo-changed', mode, cpS, async (pg) => {
      await sheet(pg);
      await pg.locator('dialog[open] input[type=file]').first().setInputFiles(`${FIX}/photo-800.jpg`);
      await text(pg, 'Fit your face in the circle.');
      await pg.getByRole('button', { name: 'Use this photo' }).click();
      await text(pg, 'This doesn’t look like a photo of you.');
      await pg.getByRole('button', { name: 'Use it anyway' }).click();
      await pg.waitForURL((u) => u.pathname === '/members/you');
      await text(pg, 'Photo changed');
    }, { full: false });

    // ---------------------------------------------------------------- Blocked members
    const b = await makeMemberWithPhoto(`shb${mode}`);
    const o1 = await makeMemberWithPhoto('ollie');
    const o2 = await makeMemberWithPhoto('priya');
    for (const o of [o1, o2]) await action('messages.blockMember', [{ memberId: o.id }], b.session);
    const bS = await session(b.email, mode);
    await shoot('blocked-list', mode, bS, open('/members/you/blocked'));
    await shoot('blocked-unblock', mode, bS, async (pg) => {
      await open('/members/you/blocked')(pg);
      await pg.getByRole('button', { name: 'Unblock Ollie' }).click();
      await pg.getByRole('alertdialog').waitFor();
    }, { full: false });
    const e = await makeMemberWithPhoto(`she${mode}`);
    await shoot('blocked-empty', mode, await session(e.email, mode), open('/members/you/blocked'));
  }
} finally {
  await browser.close();
}
