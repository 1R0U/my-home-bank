import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
const mockPlaySoundEffect = jest.fn();
jest.mock("../lib/audio", () => ({
  playSoundEffect: (...args: unknown[]) => mockPlaySoundEffect(...args),
}));

const mockFetchTransactions = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/transactions", () => ({
  fetchTransactions: (...args: unknown[]) => mockFetchTransactions(...args),
}));

import { router } from "expo-router";
import ChildHistoryScreen from "../components/ChildHistoryScreen";
import { TutorialContext, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS } from "../lib/tutorial";
import { useAppStore } from "../store";

const child = {
  balance: 120,
  created_at: "2026-07-01T00:00:00Z",
  id: "22222222-2222-2222-2222-222222222222",
  name: "たろう",
  role: "child" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
});

test("子供用の履歴画面は、自分の取引を新しい順に出す", async () => {
  mockFetchTransactions.mockResolvedValueOnce([
    { amount: 30, created_at: "2026-07-01T00:00:00Z", description: "お風呂掃除", id: "t1", type: "quest_reward", user_id: child.id },
    { amount: -20, created_at: "2026-07-03T00:00:00Z", description: "おかし", id: "t2", type: "store_purchase", user_id: child.id },
  ]);

  render(<ChildHistoryScreen />);

  await waitFor(() => expect(screen.getByText("お風呂掃除")).toBeTruthy());
  expect(mockFetchTransactions).toHaveBeenCalledWith(child.id);
  expect(screen.getByText("たろうのりれき")).toBeTruthy();

  const rows = screen.getAllByLabelText(/お風呂掃除|おかし/);
  expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
    expect.stringContaining("おかし"),
    expect.stringContaining("お風呂掃除"),
  ]);
});

test("取引が無いときは、まだ無いことを知らせる", async () => {
  mockFetchTransactions.mockResolvedValueOnce([]);

  render(<ChildHistoryScreen />);

  await waitFor(() => expect(screen.getByText("まだりれきがありません")).toBeTruthy());
});

test("取得に失敗したら、ふりがな付きの文言と再試行ボタンを出す", async () => {
  mockFetchTransactions.mockRejectedValueOnce(new Error("network"));

  render(<ChildHistoryScreen />);

  await waitFor(() => expect(screen.getByRole("button", { name: "りれきの取得を再試行" })).toBeTruthy());
  mockFetchTransactions.mockResolvedValueOnce([]);
  fireEvent.press(screen.getByRole("button", { name: "りれきの取得を再試行" }));
  await waitFor(() => expect(screen.getByText("まだりれきがありません")).toBeTruthy());
  expect(mockFetchTransactions).toHaveBeenCalledTimes(2);
});

test("粒度の切り替えボタンで、月→年の順に切り替わる", async () => {
  mockFetchTransactions.mockResolvedValueOnce([]);

  render(<ChildHistoryScreen />);

  const button = await screen.findByRole("button", { name: "表示期間: 月単位。タップで切り替え" });
  fireEvent.press(button);
  expect(screen.getByRole("button", { name: "表示期間: 年単位。タップで切り替え" })).toBeTruthy();
  expect(mockPlaySoundEffect).toHaveBeenCalledWith("confirm");
});

test("戻るボタンで前の画面へ戻る", async () => {
  mockFetchTransactions.mockResolvedValueOnce([]);

  render(<ChildHistoryScreen />);

  fireEvent.press(await screen.findByRole("button", { name: "前の画面に戻る" }));
  expect(router.back).toHaveBeenCalled();
  expect(mockPlaySoundEffect).toHaveBeenCalledWith("cancel");
});

test("履歴の紹介は戻るボタンを囲み、戻ったときだけ次へ進む", async () => {
  mockFetchTransactions.mockResolvedValueOnce([]);
  const tutorial: TutorialContextValue = {
    role: "child", mode: "running", index: 0, step: TUTORIAL_STEPS.child.find((step) => step.id === "child-history-back"),
    storageError: false, home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn(),
  };

  render(<TutorialContext.Provider value={tutorial}><ChildHistoryScreen /></TutorialContext.Provider>);

  const back = await screen.findByRole("button", { name: "前の画面に戻る" });
  expect(tutorial.advance).not.toHaveBeenCalled();
  expect(screen.getByTestId("tutorial-frame-child-history-back")).toBeTruthy();
  fireEvent.press(back);
  expect(tutorial.advance).toHaveBeenCalledWith("child-history-back");
});
