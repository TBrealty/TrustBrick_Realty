// Puts the app on the Android phone on the USB cable. Run from mobile/:
//
//   npm run phone:update    build the app with its code inside (a release build) and install it;
//                           run again after any change to update the app on the phone
//   npm run phone:connect   after re-plugging the cable: forward the website (and dev server) again
//   npm run phone:dev       switch back to the development build (live reload from `npx expo start`)
//
// The phone reaches the website on this computer at http://localhost:3000 over the cable, so keep
// the website running (`npm run dev` at the repository root). Needs ANDROID_HOME (the Android SDK).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PACKAGE = "in.trustbrick.app";
const root = path.resolve(import.meta.dirname, "..");
const androidDir = path.join(root, "android");
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const adbPath = path.join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
// By full path: with a shell, Windows would look for gradlew.bat on the PATH, not in android/.
const gradlew = `"${path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew")}"`;
const apk = (variant) => path.join(androidDir, "app", "build", "outputs", "apk", variant, `app-${variant}.apk`);

function run(command, args, { cwd = root, env = {}, quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: quiet ? "pipe" : "inherit", shell: process.platform === "win32", env: { ...process.env, ANDROID_HOME: sdk, CI: "1", ...env } });
  if (result.status !== 0) {
    if (quiet) process.stderr.write(String(result.stderr ?? ""));
    console.error(`\n✗ ${command} ${args.join(" ")} failed.`);
    process.exit(result.status ?? 1);
  }
  return String(result.stdout ?? "").trim();
}

const command = process.argv[2];
// The phone on the cable (-d), not an emulator or a phone over Wi-Fi.
const target = "-d";
const where = "the phone";
const adb = (...args) => run(`"${adbPath}"`, [target, ...args], { quiet: true });
const step = (text) => console.log(`\n▸ ${text}`);

function requirePhone() {
  if (!existsSync(adbPath)) {
    console.error(`✗ adb not found at ${adbPath}. Set ANDROID_HOME to the Android SDK.`);
    process.exit(1);
  }
  const state = spawnSync(`"${adbPath}"`, [target, "get-state"], { shell: process.platform === "win32", encoding: "utf8" });
  if (state.stdout.trim() !== "device") {
    console.error("✗ No phone found. Plug it in, unlock it and allow USB debugging (\"Always allow from this computer\").");
    process.exit(1);
  }
}

function connect() {
  adb("reverse", "tcp:3000", "tcp:3000");
  adb("reverse", "tcp:8081", "tcp:8081");
  console.log(`✓ ${where.charAt(0).toUpperCase() + where.slice(1)} reaches this computer's website (port 3000) and dev server (port 8081).`);
}

function install(file) {
  step(`Installing on ${where}`);
  adb("install", "-r", `"${file}"`);
  connect();
  adb("shell", "am", "start", "-n", `${PACKAGE}/.MainActivity`);
}

function gradle(task, env = {}) {
  run(gradlew, [task, "-x", "lint", "-x", "test", "--build-cache", "-PreactNativeArchitectures=arm64-v8a"], { cwd: androidDir, env });
  // The computer is short on memory: don't leave Gradle's background process running.
  run(gradlew, ["--stop"], { cwd: androidDir, quiet: true });
}

requirePhone();

if (command === "connect") {
  connect();
} else if (command === "update") {
  const env = { TRUSTBRICK_LOCAL_RELEASE: "1", EXPO_PUBLIC_API_URL: "http://localhost:3000", NODE_ENV: "production" };
  step("Preparing the Android project");
  run("npx", ["expo", "prebuild", "--platform", "android", "--no-clean", "--no-install"], { env });
  step("Building the app (the first time takes a while; updates after that are quicker)");
  gradle("app:assembleRelease", env);
  install(apk("release"));
  console.log(`\n✓ Updated. The app opens on ${where}; its code is inside it now.`);
} else if (command === "dev") {
  if (!existsSync(apk("debug"))) {
    step("Building the development app");
    run("npx", ["expo", "prebuild", "--platform", "android", "--no-clean", "--no-install"]);
    gradle("app:assembleDebug");
  }
  install(apk("debug"));
  console.log("\n✓ Development build installed. Start `npx expo start --dev-client`, then open the app and pick http://localhost:8081.");
} else {
  console.log("Usage: npm run phone:update | phone:connect | phone:dev");
}
