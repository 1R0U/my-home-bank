import { act, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import ParentHomeScreen from "../components/ParentHomeScreen";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
}));

const mockFetchQuests = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../lib/taskService", () => ({
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

const mockFetchUserBalance = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
}));

// Supabase の users.id は uuid 型。実ログイン中は UUID の ID になる。
const PARENT_1_ID = "11111111-1111-1111-1111-111111111111";
const PARENT_2_ID = "22222222-2222-2222-2222-222222222222";

const parent = {
  id: PARENT_1_ID,
  name: "お父さん",
  role: "parent" as const,
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
};

const quests = [
  {
    id: "quest-1",
    title: "お風呂掃除",
    description: "浴槽をきれいにする",
    category: "daily" as const,
    reward_amount: 50,
    status: "open" as const,
    created_by: PARENT_1_ID,
    created_at: "2026-07-10T09:00:00Z",
    assigned_to: null,
  },
  {
    id: "quest-2",
    title: "宿題",
    description: "終わらせる",
    category: "daily" as const,
    reward_amount: 30,
    status: "completed" as const,
    created_by: PARENT_1_ID,
    created_at: "2026-07-10T09:00:00Z",
    assigned_to: "user-child-1",
  },
  {
    id: "quest-3",
    title: "週次の片付け",
    description: "部屋を片付ける",
    category: "weekly" as const,
    reward_amount: 80,
    status: "open" as const,
    created_by: PARENT_1_ID,
    created_at: "2026-07-10T09:00:00Z",
    assigned_to: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: parent });
  mockFetchQuests.mockResolvedValue(quests);
  mockFetchUserBalance.mockResolvedValue(777);
});

test("実際の所持金を表示する", async () => {
  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("777pt");
  });
  // 金額は所持金カード（親 Pressable）の accessibilityLabel にも含まれる
  expect(screen.getByLabelText(/所持金 777pt/)).toBeTruthy();
});

test("完了していないデイリータスクだけを一覧表示する", async () => {
  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByText("お風呂掃除")).toBeTruthy();
  });
  expect(screen.queryByText("宿題")).toBeNull();
  expect(screen.queryByText("週次の片付け")).toBeNull();
});

test("デイリータスクがない場合は空メッセージを表示する", async () => {
  mockFetchQuests.mockResolvedValue([]);
  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByText("デイリータスクはありません")).toBeTruthy();
  });
});

test("クエスト取得中は空メッセージや承認待ちバッジを表示しない", async () => {
  let resolveQuests: (q: unknown) => void = () => undefined;
  mockFetchQuests.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveQuests = resolve;
      }),
  );

  render(<ParentHomeScreen />);

  // 残高取得は別系統なので先に表示される
  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("777pt");
  });

  // クエスト取得が完了するまでは「タスクなし」も承認待ちバッジも出さない
  expect(screen.queryByText("デイリータスクはありません")).toBeNull();
  expect(screen.queryByLabelText(/承認待ち/)).toBeNull();

  // 取得完了後は通常表示に戻る
  await act(async () => {
    resolveQuests([
      quests[0],
      { ...quests[1], id: "quest-pending", status: "pending" },
    ]);
  });

  await waitFor(() => {
    expect(screen.getByText("お風呂掃除")).toBeTruthy();
  });
  expect(screen.getByLabelText(/承認待ちが1件/)).toBeTruthy();
});

test("開発用クイックログイン（非UUIDのモックユーザー）では残高取得をスキップし、エラーを出さない", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: { ...parent, id: "user-parent-1", balance: 640 } });

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByText("お風呂掃除")).toBeTruthy();
  });

  expect(mockFetchUserBalance).not.toHaveBeenCalled();
  expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("640pt");
  expect(screen.queryByText("残高を取得できませんでした")).toBeNull();
  expect(warnSpy).not.toHaveBeenCalled();

  warnSpy.mockRestore();
});

test("残高取得に失敗した場合はモックの残高にフォールバックしつつエラー表示を出す", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchUserBalance.mockRejectedValue(new Error("network error"));

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(mockFetchUserBalance).toHaveBeenCalledWith(PARENT_1_ID);
  });

  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("500pt");
  });
  expect(screen.getByText("残高を取得できませんでした")).toBeTruthy();
  expect(warnSpy).toHaveBeenCalled();

  warnSpy.mockRestore();
});

test("残高取得中にユーザーが切り替わっても、後から解決した古いリクエストの結果で上書きされない", async () => {
  let resolveFirstRequest: (balance: number) => void = () => undefined;
  const firstRequest = new Promise<number>((resolve) => {
    resolveFirstRequest = resolve;
  });
  mockFetchUserBalance.mockImplementationOnce(() => firstRequest).mockResolvedValueOnce(999);

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(mockFetchUserBalance).toHaveBeenCalledTimes(1);
  });

  // 1回目のリクエストが解決する前に、ユーザーが切り替わって2回目のリクエストが走る
  act(() => {
    useAppStore.setState({ user: { ...parent, id: PARENT_2_ID } });
  });

  await waitFor(() => {
    expect(mockFetchUserBalance).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("999pt");
  });

  // 先に開始した(遅い)1回目のリクエストが後から解決しても、最新の表示を上書きしない
  await act(async () => {
    resolveFirstRequest(111);
    await firstRequest;
  });

  expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("999pt");
});

test("別ユーザーに切り替えると、切替後の取得が終わるまで前ユーザーの残高を表示し続けない", async () => {
  let resolveSecond: (balance: number) => void = () => undefined;
  const secondRequest = new Promise<number>((resolve) => {
    resolveSecond = resolve;
  });
  // 1人目: 777 を即時解決 / 2人目: 保留のまま
  mockFetchUserBalance.mockResolvedValueOnce(777).mockImplementationOnce(() => secondRequest);

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("777pt");
  });

  // 別ユーザー（モック残高 1,234pt）へ切り替え
  act(() => {
    useAppStore.setState({ user: { ...parent, id: PARENT_2_ID, balance: 1234 } });
  });

  await waitFor(() => {
    expect(mockFetchUserBalance).toHaveBeenCalledTimes(2);
  });

  // 2人目の取得が終わるまでは、1人目の 777 ではなく 2人目のモック値にフォールバックする
  await waitFor(() => {
    expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("1,234pt");
  });

  // 2人目の取得が完了したら実値に更新される
  await act(async () => {
    resolveSecond(2000);
    await secondRequest;
  });
  expect(screen.getByTestId("parent-home-balance-amount")).toHaveTextContent("2,000pt");
});
