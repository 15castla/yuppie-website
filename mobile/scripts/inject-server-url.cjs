// Stamps the same URL capacitor.config.ts resolves (CAPACITOR_SERVER_URL,
// defaulting to production) into www-placeholder/offline.html's retry
// button, so "Try again" on the offline screen returns to whichever
// environment this particular build actually points at (prod, a Vercel
// preview, or a local dev server) instead of always hardcoding
// clubyuppie.com. Runs as part of `npm run sync`, before `cap sync` copies
// webDir into the native projects.
const fs = require("fs");
const path = require("path");

const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://clubyuppie.com";
const filePath = path.join(__dirname, "..", "www-placeholder", "offline.html");

const original = fs.readFileSync(filePath, "utf8");
const updated = original.replace(
  /var SITE_URL = "[^"]*";/,
  `var SITE_URL = ${JSON.stringify(serverUrl)};`,
);

fs.writeFileSync(filePath, updated);
console.log(`[inject-server-url] offline.html retry target set to ${serverUrl}`);
