/**
 * Reads version from package.json and updates app/build.gradle.kts
 * (versionName and versionCode). versionCode = major*10000 + minor*100 + patch.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const gradlePath = path.join(__dirname, "..", "app", "build.gradle.kts");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;
const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

let gradle = fs.readFileSync(gradlePath, "utf8");
gradle = gradle.replace(
  /versionCode\s+\d+/,
  `versionCode = ${versionCode}`
);
gradle = gradle.replace(
  /versionName\s+"[^"]*"/,
  `versionName = "${version}"`
);
fs.writeFileSync(gradlePath, gradle);

console.log(`Synced Android version: ${version} (versionCode ${versionCode})`);
