import { render } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Text } from "react-native";

// useFocusEffect に渡された effect と、その戻り値（後始末）を記録する。
let capturedEffect: (() => unknown) | undefined;
let capturedCleanup: unknown;

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => unknown) => {
    require("react").useEffect(() => {
      capturedEffect = effect;
      capturedCleanup = effect();
    }, [effect]);
  },
}));

import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";

function Probe({ reload }: { reload: () => void | (() => void) | Promise<unknown> }) {
  useRefetchOnFocus(reload);
  return <Text>probe</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedEffect = undefined;
  capturedCleanup = undefined;
});

test("フォーカス時に reload を呼ぶ", () => {
  const reload = jest.fn<() => void>();

  render(<Probe reload={reload} />);

  expect(reload).toHaveBeenCalledTimes(1);
  expect(capturedEffect).toBeDefined();
});

test("reload が返した後始末の関数は、そのまま useFocusEffect へ渡す", () => {
  const cleanup = jest.fn();
  const reload = jest.fn(() => cleanup);

  render(<Probe reload={reload} />);

  expect(capturedCleanup).toBe(cleanup);
});

test("async な reload の Promise は後始末として渡さない", async () => {
  // Promise をそのまま返すと useFocusEffect が後始末の関数として扱い、
  // アンマウント時に「関数ではない」と落ちる。関数のときだけ通すことを確かめる。
  const reload = jest.fn(async () => {});

  render(<Probe reload={reload} />);

  expect(reload).toHaveBeenCalledTimes(1);
  expect(capturedCleanup).toBeUndefined();
});

test("reload が何も返さないときは後始末なしになる", () => {
  const reload = jest.fn(() => undefined);

  render(<Probe reload={reload} />);

  expect(capturedCleanup).toBeUndefined();
});
