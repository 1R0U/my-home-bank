module.exports = {
  moduleNameMapper: {
    "\\.(mp3|ogg|txt)$": "<rootDir>/tests/audioAssetMock.js",
    "^react-native-webview$": "<rootDir>/tests/webViewMock.js",
  },
  preset: "jest-expo",
  // gesture-handler v3（SDK 58）はネイティブモジュールの代わりが無いと動かないため、公式の代わりを入れる
  setupFiles: ["react-native-gesture-handler/jestSetup.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/jestSetup.ts"],
  testMatch: ["<rootDir>/tests/**/*.render.test.tsx"],
};
