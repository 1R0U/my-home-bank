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

const parent = {
  id: "user-parent-1",
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
    created_by: "user-parent-1",
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
    created_by: "user-parent-1",
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
    created_by: "user-parent-1",
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
    expect(screen.getByLabelText("所持金")).toHaveTextContent("777pt");
  });
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

test("残高取得に失敗した場合はモックの残高にフォールバックする", async () => {
  mockFetchUserBalance.mockRejectedValue(new Error("network error"));

  render(<ParentHomeScreen />);

  await waitFor(() => {
    expect(mockFetchUserBalance).toHaveBeenCalledWith("user-parent-1");
  });

  await waitFor(() => {
    expect(screen.getByLabelText("所持金")).toHaveTextContent("500pt");
  });
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
    useAppStore.setState({ user: { ...parent, id: "user-parent-2" } });
  });

  await waitFor(() => {
    expect(mockFetchUserBalance).toHaveBeenCalledTimes(2);
  });
  await waitFor(() => {
    expect(screen.getByLabelText("所持金")).toHaveTextContent("999pt");
  });

  // 先に開始した(遅い)1回目のリクエストが後から解決しても、最新の表示を上書きしない
  await act(async () => {
    resolveFirstRequest(111);
    await firstRequest;
  });

  expect(screen.getByLabelText("所持金")).toHaveTextContent("999pt");
});
