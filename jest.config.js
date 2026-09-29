module.exports = {
  moduleNameMapper: {
    "\\.(mp3|ogg|txt)$": "<rootDir>/tests/audioAssetMock.js",
    "^react-native-webview$": "<rootDir>/tests/webViewMock.js",
  },
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/**/*.render.test.tsx"],
};
