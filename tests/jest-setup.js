import '@testing-library/jest-native/extend-expect';

// Mock safe-area and css-interop to avoid native side-effects
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-css-interop', () => ({
  wrapJSX: (node) => node,
  createInteropElement: (el) => el,
  createInteropNode: (n) => n,
  runtime: {},
}));

// Ensure react-test-renderer exposes createRoot used by testing-library
jest.mock('react-test-renderer', () => {
  const rt = jest.requireActual('react-test-renderer');
  return {
    ...rt,
    createRoot: (el) => ({ render: () => rt.create(el) }),
  };
});

// Provide a mock router with an internal push spy (exposed on global for tests)
jest.mock('expo-router', () => {
  const React = require('react');
  const pushMockLocal = jest.fn();
  // expose for test assertions if needed
  global.__EXPO_ROUTER_PUSH_MOCK__ = pushMockLocal;
  return {
    Link: ({ children, href }) => React.cloneElement(children, { onPress: () => pushMockLocal(href) }),
    router: { push: pushMockLocal },
    __esModule: true,
  };
});

// Keep react-native real module where possible; only mock specific native libs above.
