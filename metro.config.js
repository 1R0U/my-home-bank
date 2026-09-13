const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Babylon スパイク: assets/babylon-spike/babylon.txt（Babylon.js の UMD ビルド）を
// アセットとしてバンドルし、実行時に文字列として読み込めるようにする。
if (!config.resolver.assetExts.includes("txt")) {
  config.resolver.assetExts.push("txt");
}

module.exports = withNativeWind(config, { input: "./global.css" });
