import { act, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

let mockFocusCallback: (() => void) | undefined;

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    require("react").useEffect(() => {
      mockFocusCallback = effect;
      effect();
    }, []);
  },
}));

const mockFetchTransactions = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/transactions", () => ({
  fetchTransactions: (...args: unknown[]) => mockFetchTransactions(...args),
}));

import HistoryScreen from "../components/HistoryScreen";
import { useAppStore } from "../store";

const parent = {
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
  id: "11111111-1111-1111-1111-111111111111",
  name: "お父さん",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallback = undefined;
  useAppStore.setState({ user: parent });
});

test("タブが再フォーカスされるたびに取引を再取得する（他タブでの操作による新しい取引を拾うため）", async () => {
  mockFetchTransactions.mockResolvedValueOnce([
    {
      amount: 10,
      created_at: "2026-07-01T00:00:00Z",
      description: "お風呂掃除",
      id: "t1",
      type: "quest_reward",
      user_id: parent.id,
    },
  ]);

  render(<HistoryScreen />);

  await waitFor(() => expect(screen.getByText("お風呂掃除")).toBeTruthy());
  expect(mockFetchTransactions).toHaveBeenCalledTimes(1);

  mockFetchTransactions.mockResolvedValueOnce([
    {
      amount: 10,
      created_at: "2026-07-01T00:00:00Z",
      description: "お風呂掃除",
      id: "t1",
      type: "quest_reward",
      user_id: parent.id,
    },
    {
      amount: 20,
      created_at: "2026-07-02T00:00:00Z",
      description: "食器洗い",
      id: "t2",
      type: "quest_reward",
      user_id: parent.id,
    },
  ]);

  // 他タブでクエストを承認するなどして新しい取引が発生した後、
  // 履歴タブへ戻ってきた（再フォーカスされた）状況を再現する
  await act(async () => {
    mockFocusCallback?.();
  });

  await waitFor(() => expect(screen.getByText("食器洗い")).toBeTruthy());
  expect(mockFetchTransactions).toHaveBeenCalledTimes(2);
});
