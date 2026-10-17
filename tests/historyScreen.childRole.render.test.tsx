import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { TutorialContext, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS } from "../lib/tutorial";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
// ゲストユーザー（Issue #211）はIDがUUIDなので、開発用ロール指定でも実データを取りに行く。
// 実クライアントを呼ばないようサービス層を差し替える
jest.mock("../lib/transactions", () => ({
  fetchTransactions: jest.fn(() => Promise.resolve([])),
}));

import HistoryScreen from "../components/HistoryScreen";

test("子供が履歴画面を開いたときは戻るボタンを表示する", async () => {
  render(<HistoryScreen />);
  await act(async () => undefined);

  expect(screen.getByLabelText("前の画面に戻る")).toBeTruthy();
});

test("子供本人の履歴表示機能は引き続き利用できる", async () => {
  render(<HistoryScreen />);
  await act(async () => undefined);

  expect(screen.getByText("収支グラフ")).toBeTruthy();
  expect(screen.getByText("取引履歴")).toBeTruthy();
});

test("履歴の紹介は戻るボタンを囲み、戻ったときだけ次へ進む", async () => {
  const tutorial: TutorialContextValue = {
    role: "child", mode: "running", index: 0, step: TUTORIAL_STEPS.child.find((step) => step.id === "child-history-back"),
    storageError: false, home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn(),
  };
  render(<TutorialContext.Provider value={tutorial}><HistoryScreen /></TutorialContext.Provider>);
  await act(async () => undefined);
  expect(tutorial.advance).not.toHaveBeenCalled();
  expect(screen.getByTestId("tutorial-frame-child-history-back")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("前の画面に戻る"));
  expect(tutorial.advance).toHaveBeenCalledWith("child-history-back");
});
