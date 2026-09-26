module.exports = {
  moduleNameMapper: {
    "\\.(mp3|ogg)$": "<rootDir>/tests/audioAssetMock.js",
  },
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/**/*.render.test.tsx"],
};
