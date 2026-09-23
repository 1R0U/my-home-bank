import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Text } from "react-native";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchUserBalance = jest.fn<(...args: unknown[]) => Promise<number>>();

jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
}));

import { useLiveBalance } from "../lib/useLiveBalance";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

/** フックの結果をそのまま描画するだけの確認用コンポーネント。 */
function Probe({ isLive, userId }: { isLive: boolean; userId: string | undefined }) {
  const { balance, hasError } = useLiveBalance(userId, isLive);
  return (
    <>
      <Text testID="balance">{balance === null ? "none" : String(balance)}</Text>
      <Text testID="error">{hasError ? "error" : "ok"}</Text>
    </>
  );
}

const balanceText = () => screen.getByTestId("balance").props.children;
const errorText = () => screen.getByTestId("error").props.children;

/** 解決タイミングを手元で決められる Promise。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("取得の可否", () => {
  test("ライブでなければ実APIを呼ばない", () => {
    render(<Probe isLive={false} userId={USER_A} />);

    expect(mockFetchUserBalance).not.toHaveBeenCalled();
    expect(balanceText()).toBe("none");
  });

  test("非UUIDのモックIDでは実APIを呼ばない", () => {
    // 開発用クイックログインのID。users.id は uuid 型なので呼んでも失敗するだけ（#174）
    render(<Probe isLive userId="user-child-1" />);

    expect(mockFetchUserBalance).not.toHaveBeenCalled();
    expect(balanceText()).toBe("none");
  });

  test("未ログイン（userIdなし）でも呼ばない", () => {
    render(<Probe isLive userId={undefined} />);

    expect(mockFetchUserBalance).not.toHaveBeenCalled();
  });

  test("ライブかつUUIDなら取得して返す", async () => {
    mockFetchUserBalance.mockResolvedValue(500);

    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(mockFetchUserBalance).toHaveBeenCalledWith(USER_A);
    expect(balanceText()).toBe("500");
    expect(errorText()).toBe("ok");
  });
});

describe("ユーザーの切り替え", () => {
  test("切り替えた直後に、前のユーザーの残高を出さない", async () => {
    // Issue #147 の本題。取得結果に userId を紐付けていないと、
    // 再取得が終わるまでの間ずっと前のユーザーの残高が見えてしまう
    const first = deferred<number>();
    mockFetchUserBalance.mockReturnValueOnce(first.promise);

    const view = render(<Probe isLive userId={USER_A} />);
    await act(async () => {
      first.resolve(500);
    });
    expect(balanceText()).toBe("500");

    // Bの取得は終わらせない。この時点で表示が500のままなら前ユーザーの残高が漏れている
    const second = deferred<number>();
    mockFetchUserBalance.mockReturnValueOnce(second.promise);
    view.rerender(<Probe isLive userId={USER_B} />);

    expect(balanceText()).toBe("none");
  });

  test("前のユーザーの取得が遅れて返ってきても、その値を採用しない", async () => {
    const first = deferred<number>();
    const second = deferred<number>();
    mockFetchUserBalance.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const view = render(<Probe isLive userId={USER_A} />);
    view.rerender(<Probe isLive userId={USER_B} />);

    await act(async () => {
      // Aの応答がBへ切り替えた後に届く
      first.resolve(500);
      second.resolve(320);
    });

    expect(balanceText()).toBe("320");
  });

  test("エラーもユーザーに紐づく。切り替えたらエラー表示を持ち越さない", async () => {
    mockFetchUserBalance.mockRejectedValueOnce(new Error("取得失敗"));

    const view = render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);
    expect(errorText()).toBe("error");

    mockFetchUserBalance.mockReturnValueOnce(deferred<number>().promise);
    view.rerender(<Probe isLive userId={USER_B} />);

    expect(errorText()).toBe("ok");
  });
});

describe("失敗したとき", () => {
  test("残高はnull、エラーは立てる（表示側はモック値へ戻せる）", async () => {
    mockFetchUserBalance.mockRejectedValue(new Error("取得失敗"));

    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(balanceText()).toBe("none");
    expect(errorText()).toBe("error");
  });
});
