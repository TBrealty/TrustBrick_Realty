// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The app shares plain TypeScript with the website (formatting, labels, filter and plan rules),
// imported as "@/lib/…" from ../lib. Metro only needs to watch that folder; anything those files
// import from npm (none should) resolves from this app's node_modules.
const shared = path.resolve(__dirname, "../lib");
config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
