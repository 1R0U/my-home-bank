import { act, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
// ゲストユーザー（Issue #211）はIDがUUIDなので、開発用ロール指定でも実データを取りに行く。
// 実クライアントを呼ばないようサービス層を差し替える
jest.mock("../lib/transactions", () => ({
  fetchTransactions: jest.fn(() => Promise.resolve([])),
}));

import AdultHistoryScreen from "../components/AdultHistoryScreen";

test("大人用の履歴画面は戻るボタンを表示しない（大人用タブのルート画面のため）", async () => {
  render(<AdultHistoryScreen />);
  await act(async () => undefined);

  expect(screen.queryByLabelText("前の画面に戻る")).toBeNull();
  expect(screen.getByText("収支グラフ")).toBeTruthy();
  expect(screen.getByText("取引履歴")).toBeTruthy();
});
