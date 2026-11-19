const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Expo's default config already understands pnpm workspaces (SDK 52+).
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" });
