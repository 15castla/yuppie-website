// Builds the launch splash. On Android it is the full Yuppie wordmark
// (public/yuppie_logo_forte_forward.png) on yellow, decoupled from
// assets/logo.png, which is now the standalone "y" icon mark and drives the
// Android app icon only. iOS has its own layered Icon Composer icon,
// ios/App/App/AppIcon.icon (see scripts/ios-icon-stub.cjs), and, since
// 1 Nov 2026, its own opening screen ("On the rule": the wordmark, the
// tagline and the three figures standing on a line), see the ios phase.
//
//   source  — writes assets/splash.png + assets/splash-dark.png (2732x2732).
//             capacitor-assets processes input files sequentially — logo,
//             then splash, then splash-dark — so these overwrite the
//             "y"-on-yellow splashes Easy Mode derives from logo.png, while
//             logo.png keeps generating the icons. splash-dark.png is
//             required too: without it the dark-mode splash variants keep
//             logo.png's version. capacitor-assets also writes iOS's
//             Splash.imageset from them; the ios phase then replaces that.
//
//   android — re-bakes every res/drawable*/splash.png in place. Custom
//             Mode cover-crops the square splash.png to each bucket's
//             aspect ratio, so the wordmark's width as a fraction of the
//             screen would drift between 3:4, 2:3 and 9:16 buckets. The
//             shipped drawables (and MainActivity.showCometRing) instead
//             assume a fixed fraction of each bucket's own width.
//
//   ios     — replaces ios/App/App/Assets.xcassets/Splash.imageset with the
//             opening screen: assets/opening-on-the-rule.png (upright, every
//             iPhone and iPad, and iPad on its side) and
//             assets/opening-on-the-rule-landscape.png (an iPhone on its side:
//             Apple's compact height), each a 2732x2732 picture shown
//             aspect-fill by LaunchScreen.storyboard and OpeningScreenView.
//             Those two pictures are the masters (rendered from the design,
//             not built here). The line the figures stand on is drawn by
//             ios/App/App/OpeningScreenView.swift at rows measured in them:
//             if either picture changes, measure again and change that file.
//
// The fractions below are the wordmark's measured ink bounding box in the
// splashes that shipped before logo.png changed; MainActivity.showCometRing
// frames its ring around them, so keep both in sync if Android's splash
// layout ever changes. (iOS's comet ring went with the opening screen.)
const fs = require("fs");
const path = require("path");
// Loaded only by the phases that draw (the ios phase just copies files).
const sharp = (...args) => require("sharp")(...args);

const BACKGROUND = "#FFD904";
const VERTICAL_CENTER_FRAC = 0.47;
// The square source's wordmark width (named for iOS, which used it until the
// opening screen; now it only feeds capacitor-assets' pass before the re-bakes).
const IOS_WIDTH_FRAC = 0.2233;
const ANDROID_PORTRAIT_WIDTH_FRAC = 0.462;
const ANDROID_LANDSCAPE_WIDTH_FRAC = 0.2555;

const mobileDir = path.join(__dirname, "..");
const wordmarkPath = path.join(mobileDir, "..", "public", "yuppie_logo_forte_forward.png");
const androidResDir = path.join(mobileDir, "android", "app", "src", "main", "res");
const iosSplashDir = path.join(mobileDir, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");

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

// The same 2732x2732 picture at 1x, 2x and 3x (aspect-fill makes the size in
// points irrelevant), plus the compact-height variant. No dark variants: the
// opening screen is yellow in dark mode too, so "any" covers both.
async function buildIos() {
  const masters = [
    { from: "opening-on-the-rule.png", suffix: "anyany", traits: {} },
    { from: "opening-on-the-rule-landscape.png", suffix: "anycompact", traits: { "height-class": "compact" } },
  ];
  const images = [];
  const keep = new Set(["Contents.json"]);
  for (const master of masters) {
    const source = path.join(mobileDir, "assets", master.from);
    for (const scale of ["1x", "2x", "3x"]) {
      const filename = `Default@${scale}~universal~${master.suffix}.png`;
      fs.copyFileSync(source, path.join(iosSplashDir, filename));
      keep.add(filename);
      images.push({ filename, ...master.traits, idiom: "universal", scale });
    }
  }
  for (const name of fs.readdirSync(iosSplashDir)) {
    if (!keep.has(name)) fs.unlinkSync(path.join(iosSplashDir, name));
  }
  const contents = { images, info: { author: "xcode", version: 1 } };
  fs.writeFileSync(path.join(iosSplashDir, "Contents.json"), JSON.stringify(contents, null, 2) + "\n");
  console.log(`[build-splash] wrote the iOS opening screen (${images.length} images)`);
}

const phase = process.argv[2];
const run = { source: buildSource, android: buildAndroid, ios: buildIos }[phase];
if (!run) {
  console.error("usage: node scripts/build-splash.cjs <source|android|ios>");
  process.exit(1);
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
