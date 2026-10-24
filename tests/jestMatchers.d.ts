// Testing Library の追加の matcher（toHaveTextContent・toBeDisabled など）の型を、
// `@jest/globals` の expect に足す。
//
// Testing Library は `@jest/expect` の Matchers を拡張しているが、Jest 30（SDK 58の jest-expo が使う）では
// Matchers は `expect` 側にあり、`@jest/expect` は再公開しているだけなので拡張が届かない（Issue #485）。
import type { JestNativeMatchers } from "@testing-library/react-native/dist/matchers/types";

declare module "expect" {
  interface Matchers<R extends void | Promise<void>, T = unknown> extends JestNativeMatchers<R> {}
}
