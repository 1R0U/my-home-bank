import { act, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "parent" }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
// ゲストユーザー（Issue #211）はIDがUUIDなので、開発用ロール指定でも実データを取りに行く。
// 実クライアントを呼ばないようサービス層を差し替える
jest.mock("../lib/transactions", () => ({
  fetchTransactions: jest.fn(() => Promise.resolve([])),
}));

import HistoryScreen from "../components/HistoryScreen";

test("大人が履歴画面を開いたときは大人用の下部メニューバーを表示する", async () => {
  render(<HistoryScreen />);
  await act(async () => undefined);

  expect(screen.getByRole("button", { name: "ホーム" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ローン" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ストア" })).toBeTruthy();
});
