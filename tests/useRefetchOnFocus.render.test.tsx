import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Text } from "react-native";

// useFocusEffect に渡された effect と、その戻り値（後始末）を記録する。
// jest.mock のファクトリから参照するため mock 接頭辞を付ける
// （tests/historyScreen.refocus.render.test.tsx の mockFocusCallback と同じ）。
let mockCapturedEffect: (() => unknown) | undefined;
let mockCapturedCleanup: unknown;

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => unknown) => {
    require("react").useEffect(() => {
      mockCapturedEffect = effect;
      mockCapturedCleanup = effect();
    }, [effect]);
  },
}));

import { markDataChanged } from "../lib/dataFreshness";
import { REFETCH_MIN_INTERVAL_MS, useRefetchOnFocus } from "../lib/useRefetchOnFocus";

// 時刻はテストから進める（直近の取得から一定時間内は省く、Issue #243）。
let mockNow = 1_000_000;
jest.spyOn(Date, "now").mockImplementation(() => mockNow);

/** フォーカスが外れて、もう一度戻ってきたときの effect の呼び出しを再現する。 */
function refocus() {
  mockCapturedEffect?.();
}

/** useRefetchOnFocus を呼ぶだけの検証用コンポーネント。 */
function Probe({ reload }: { reload: () => void | (() => void) | Promise<unknown> }) {
  useRefetchOnFocus(reload);
  return <Text>probe</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapturedEffect = undefined;
  mockCapturedCleanup = undefined;
  mockNow = 1_000_000;
});

test("フォーカス時に reload を呼ぶ", () => {
  const reload = jest.fn<() => void>();

  render(<Probe reload={reload} />);

  expect(reload).toHaveBeenCalledTimes(1);
  expect(mockCapturedEffect).toBeDefined();
});

test("reload が返した後始末の関数は、そのまま useFocusEffect へ渡す", () => {
  const cleanup = jest.fn();
  const reload = jest.fn(() => cleanup);

  render(<Probe reload={reload} />);

  expect(mockCapturedCleanup).toBe(cleanup);
});

test("async な reload の Promise は後始末として渡さない", async () => {
  // Promise をそのまま返すと useFocusEffect が後始末の関数として扱い、
  // アンマウント時に「関数ではない」と落ちる。関数のときだけ通すことを確かめる。
  const reload = jest.fn(async () => {});

  render(<Probe reload={reload} />);

  expect(reload).toHaveBeenCalledTimes(1);
  expect(mockCapturedCleanup).toBeUndefined();
});

test("reload が何も返さないときは後始末なしになる", () => {
  const reload = jest.fn(() => undefined);

  render(<Probe reload={reload} />);

  expect(mockCapturedCleanup).toBeUndefined();
});

describe("直近の取得からの時間で省く（Issue #243）", () => {
  test("何も書き込まずに、時間内にもう一度フォーカスしたときは呼ばない", () => {
    const reload = jest.fn<() => void>();
    render(<Probe reload={reload} />);

    mockNow += REFETCH_MIN_INTERVAL_MS - 1;
    refocus();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("時間を過ぎてからフォーカスしたときは呼ぶ（他の端末での変化を拾う）", () => {
    const reload = jest.fn<() => void>();
    render(<Probe reload={reload} />);

    mockNow += REFETCH_MIN_INTERVAL_MS;
    refocus();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("時間内でも、この端末で書き込みがあれば呼ぶ（承認の直後に戻ると取り直す）", () => {
    const reload = jest.fn<() => void>();
    render(<Probe reload={reload} />);

    mockNow += 1_000;
    markDataChanged();
    refocus();

    expect(reload).toHaveBeenCalledTimes(2);

    // 取り直したあとは、また時間内なら省く
    mockNow += 1_000;
    refocus();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("取得の途中で書き込みがあったときは、次のフォーカスで取り直す", () => {
    // 番号は reload を呼ぶ前に控えるので、取得中の書き込みも取りこぼさない
    const reload = jest.fn(() => {
      markDataChanged();
    });
    render(<Probe reload={reload} />);

    refocus();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("reload が変わったとき（利用者が変わったなど）は、時間内でも呼ぶ", () => {
    const first = jest.fn<() => void>();
    const second = jest.fn<() => void>();
    const { rerender } = render(<Probe reload={first} />);

    rerender(<Probe reload={second} />);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("後始末の関数を返す reload は、フォーカスが外れたときに打ち切っているかもしれないので省かない", () => {
    const reload = jest.fn(() => () => {});
    render(<Probe reload={reload} />);

    refocus();

    expect(reload).toHaveBeenCalledTimes(2);
  });

  test("省く時間は呼び出し側で変えられる", () => {
    function ShortProbe({ reload }: { reload: () => void }) {
      useRefetchOnFocus(reload, { minIntervalMs: 5_000 });
      return <Text>probe</Text>;
    }
    const reload = jest.fn<() => void>();
    render(<ShortProbe reload={reload} />);

    mockNow += 5_000;
    refocus();

    expect(reload).toHaveBeenCalledTimes(2);
  });
});
