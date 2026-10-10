// The iOS app icon is ios/App/App/AppIcon.icon, a layered Icon Composer
// icon maintained by hand (its glyph layer has Liquid Glass turned off,
// which a flat PNG can't express). `capacitor-assets generate --ios`
// still writes an AppIcon.appiconset from assets/logo.png, and only into
// an existing folder with a Contents.json (it reports the failure but
// exits 0). Two icons named AppIcon would clash, so `npm run assets`
// brackets the generate step with this script:
//
//   create — writes the empty appiconset capacitor-assets expects.
//   remove — deletes it again once capacitor-assets has written to it.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
const contents = {
  images: [{ idiom: "universal", size: "1024x1024", filename: "AppIcon-512@2x.png", platform: "ios" }],
  info: { author: "xcode", version: 1 },
};

const phase = process.argv[2];
if (phase === "create") {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Contents.json"), JSON.stringify(contents, null, 2) + "\n");
} else if (phase === "remove") {
  fs.rmSync(dir, { recursive: true, force: true });
} else {
  console.error("usage: ios-icon-stub.cjs create|remove");
  process.exit(1);
}
