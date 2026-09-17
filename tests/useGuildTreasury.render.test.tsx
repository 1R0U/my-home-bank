import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Text } from "react-native";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchUserFamilyId = jest.fn<(...args: unknown[]) => Promise<string | null>>();
jest.mock("../lib/userService", () => ({
  fetchUserFamilyId: (...args: unknown[]) => mockFetchUserFamilyId(...args),
}));

const mockFetchGuildTreasury = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/treasuryService", () => ({
  fetchGuildTreasury: (...args: unknown[]) => mockFetchGuildTreasury(...args),
}));

import { useGuildTreasury } from "../lib/useGuildTreasury";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const FAMILY_ID = "33333333-3333-3333-3333-333333333333";

function makeTreasury(balance: number) {
  return {
    balance,
    created_at: "2026-07-01T00:00:00Z",
    family_id: FAMILY_ID,
    id: "treasury-1",
    initial_supply: 5000,
    minimum_reserve_rate: 0.1,
    total_supply: 5000,
    updated_at: "2026-07-01T00:00:00Z",
  };
}

/** フックの結果をそのまま描画するだけの確認用コンポーネント。 */
function Probe({ isLive, userId }: { isLive: boolean; userId: string | undefined }) {
  const { status, treasury } = useGuildTreasury(userId, isLive);
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="balance">{treasury === null ? "none" : String(treasury.balance)}</Text>
    </>
  );
}

const statusText = () => screen.getByTestId("status").props.children;
const balanceText = () => screen.getByTestId("balance").props.children;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchUserFamilyId.mockResolvedValue(FAMILY_ID);
  mockFetchGuildTreasury.mockResolvedValue(makeTreasury(1000));
});

describe("取得の可否", () => {
  test("ライブでなければ実APIを呼ばない", () => {
    render(<Probe isLive={false} userId={USER_A} />);

    expect(mockFetchUserFamilyId).not.toHaveBeenCalled();
    expect(statusText()).toBe("unavailable");
  });

  test("非UUIDのモックIDでは実APIを呼ばない", () => {
    render(<Probe isLive userId="user-parent-1" />);

    expect(mockFetchUserFamilyId).not.toHaveBeenCalled();
    expect(statusText()).toBe("unavailable");
  });

  test("未ログイン（userIdなし）でも呼ばない", () => {
    render(<Probe isLive userId={undefined} />);

    expect(mockFetchUserFamilyId).not.toHaveBeenCalled();
  });

  test("ライブかつUUIDなら取得して返す", async () => {
    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(mockFetchUserFamilyId).toHaveBeenCalledWith(USER_A);
    expect(mockFetchGuildTreasury).toHaveBeenCalledWith(FAMILY_ID);
    expect(statusText()).toBe("loaded");
    expect(balanceText()).toBe("1000");
  });
});

describe("家族・金庫の状態", () => {
  test("家族に未所属ならno_familyになり、金庫は取得しにいかない", async () => {
    mockFetchUserFamilyId.mockResolvedValue(null);

    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(statusText()).toBe("no_family");
    expect(balanceText()).toBe("none");
    expect(mockFetchGuildTreasury).not.toHaveBeenCalled();
  });

  test("家族はあるが金庫が未作成ならnot_createdになる", async () => {
    mockFetchGuildTreasury.mockResolvedValue(null);

    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(statusText()).toBe("not_created");
    expect(balanceText()).toBe("none");
  });
});

describe("失敗したとき", () => {
  test("errorになり、金庫残高はnullのまま（個人残高へのフォールバックはしない）", async () => {
    mockFetchGuildTreasury.mockRejectedValue(new Error("取得失敗"));

    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(statusText()).toBe("error");
    expect(balanceText()).toBe("none");
  });

  test("family_id取得の失敗もerrorとして扱う", async () => {
    mockFetchUserFamilyId.mockRejectedValue(new Error("取得失敗"));

    render(<Probe isLive userId={USER_A} />);
    await act(async () => undefined);

    expect(statusText()).toBe("error");
    expect(mockFetchGuildTreasury).not.toHaveBeenCalled();
  });
});

describe("ユーザーの切り替え", () => {
  test("切り替えた直後は、前のユーザーの金庫残高を出さない", async () => {
    const first = Promise.resolve(makeTreasury(1000));
    mockFetchGuildTreasury.mockReturnValueOnce(first);

    const view = render(<Probe isLive userId={USER_A} />);
    await act(async () => {
      await first;
    });
    expect(balanceText()).toBe("1000");

    let resolveSecond: (v: unknown) => void = () => undefined;
    const second = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    mockFetchGuildTreasury.mockReturnValueOnce(second);
    mockFetchUserFamilyId.mockResolvedValueOnce(FAMILY_ID);

    view.rerender(<Probe isLive userId={USER_B} />);

    expect(balanceText()).toBe("none");

    await act(async () => {
      resolveSecond(makeTreasury(2000));
    });
  });
});
