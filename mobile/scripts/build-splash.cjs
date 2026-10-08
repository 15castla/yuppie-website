// Builds the launch splash from the full Yuppie wordmark
// (public/yuppie_logo_forte_forward.png), decoupled from assets/logo.png,
// which is now the standalone "y" icon mark and drives the app icon only.
//
// Runs in two phases around `capacitor-assets generate` (see `npm run
// assets`):
//
//   source  — writes assets/splash.png + assets/splash-dark.png (2732x2732).
//             capacitor-assets processes input files sequentially — logo,
//             then splash, then splash-dark — so these overwrite the
//             "y"-on-yellow splashes Easy Mode derives from logo.png, while
//             logo.png keeps generating the icons. splash-dark.png is
//             required too: without it the dark-mode splash variants keep
//             logo.png's version. iOS uses these as-is (square-to-square
//             resize, no crop).
//
//   android — re-bakes every res/drawable*/splash.png in place. Custom
//             Mode cover-crops the square splash.png to each bucket's
//             aspect ratio, so the wordmark's width as a fraction of the
//             screen would drift between 3:4, 2:3 and 9:16 buckets. The
//             shipped drawables (and MainActivity.showCometRing) instead
//             assume a fixed fraction of each bucket's own width.
//
// The fractions below are the wordmark's measured ink bounding box in the
// splashes that shipped before logo.png changed; SceneDelegate.addCometRing
// and MainActivity.showCometRing frame their ring around them, so keep all
// three in sync if the splash layout ever changes.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BACKGROUND = "#FFD904";
const VERTICAL_CENTER_FRAC = 0.47;
const IOS_WIDTH_FRAC = 0.2233;
const ANDROID_PORTRAIT_WIDTH_FRAC = 0.462;
const ANDROID_LANDSCAPE_WIDTH_FRAC = 0.2555;

const mobileDir = path.join(__dirname, "..");
const wordmarkPath = path.join(mobileDir, "..", "public", "yuppie_logo_forte_forward.png");
const androidResDir = path.join(mobileDir, "android", "app", "src", "main", "res");

// The wordmark file has a transparent margin around the ink; trim it so the
// width fractions refer to the visible letterforms.
async function trimmedWordmark() {
  return sharp(wordmarkPath).trim().png().toBuffer();
}

async function renderSplash(wordmark, width, height, widthFrac) {
  const targetWidth = Math.round(width * widthFrac);
  const resized = await sharp(wordmark).resize({ width: targetWidth }).png().toBuffer();
  const { height: markHeight } = await sharp(resized).metadata();
  const left = Math.round((width - targetWidth) / 2);
  const top = Math.round(height * VERTICAL_CENTER_FRAC - markHeight / 2);
  return sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
    .composite([{ input: resized, left, top }])
    .flatten({ background: BACKGROUND })
    .png();
}

async function buildSource() {
  const wordmark = await trimmedWordmark();
  for (const name of ["splash.png", "splash-dark.png"]) {
    const dest = path.join(mobileDir, "assets", name);
    await (await renderSplash(wordmark, 2732, 2732, IOS_WIDTH_FRAC)).toFile(dest);
    console.log(`[build-splash] wrote assets/${name}`);
  }
}

async function buildAndroid() {
  const wordmark = await trimmedWordmark();
  const dirs = fs
    .readdirSync(androidResDir)
    .filter((d) => d.startsWith("drawable") && fs.existsSync(path.join(androidResDir, d, "splash.png")));
  for (const dir of dirs) {
    const dest = path.join(androidResDir, dir, "splash.png");
    // Size each night bucket from its light counterpart: capacitor-assets'
    // template for the generic drawable-night is 320x240 (landscape) while
    // drawable is 320x480, so taken as-is the dark-mode fallback would get
    // the landscape layout.
    const lightDir = dir.replace("-night", "");
    const sizeSource = dirs.includes(lightDir) ? path.join(androidResDir, lightDir, "splash.png") : dest;
    const { width, height } = await sharp(sizeSource).metadata();
    const widthFrac = width > height ? ANDROID_LANDSCAPE_WIDTH_FRAC : ANDROID_PORTRAIT_WIDTH_FRAC;
    const buffer = await (await renderSplash(wordmark, width, height, widthFrac)).toBuffer();
    fs.writeFileSync(dest, buffer);
  }
  console.log(`[build-splash] re-baked ${dirs.length} Android splash drawables`);
}

const phase = process.argv[2];
const run = { source: buildSource, android: buildAndroid }[phase];
if (!run) {
  console.error("usage: node scripts/build-splash.cjs <source|android>");
  process.exit(1);
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
