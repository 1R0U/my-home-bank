module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./tests/jest-setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo-router|expo-modules-core|expo-modules|expo|react-native-css-interop)/)'
  ],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^test-renderer$': 'react-test-renderer'
  },
};
