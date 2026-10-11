import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import SavingsScreen from "../components/SavingsScreen";

let mockUser = { id: "child", family_id: "family", role: "child" };
const mockFetch = jest.fn<(...args: any[]) => Promise<any>>();
const mockAmount = jest.fn<(...args: any[]) => Promise<any>>();
const mockDay = jest.fn<(...args: any[]) => Promise<any>>();
const mockWithdraw = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../store", () => ({ useCurrentUser: () => mockUser, useDataAccess: () => ({ canUseRealData: true }) }));
jest.mock("expo-router", () => ({ router: { back: jest.fn() }, useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]) }));
jest.mock("../lib/savingsService", () => ({
  fetchSavingsSummary: (...args: unknown[]) => mockFetch(...args),
  setSavingsAmount: (...args: unknown[]) => mockAmount(...args),
  setSavingsDay: (...args: unknown[]) => mockDay(...args),
  withdrawSavings: (...args: unknown[]) => mockWithdraw(...args),
}));
const summary = {
  transfer_day: 31, monthly_rate: .005,
  accounts: [{ user_id: "child", name: "たろう", balance: 300, monthly_amount: 100,
    next_transfer_date: "2026-10-31", estimated_interest: 1,
    history: [{ target_month: "2026-09-01", kind: "transfer", amount: 30, status: "partial" }] }],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: "child", family_id: "family", role: "child" };
  mockFetch.mockResolvedValue(summary);
  mockAmount.mockResolvedValue(undefined);
  mockDay.mockResolvedValue(undefined);
  mockWithdraw.mockReset().mockResolvedValue(undefined);
});
test("子は残高・次回日・利息見込・部分積立を確認し停止できる", async () => {
  render(<SavingsScreen />);
  await screen.findByText("積立預金残高：300 gol");
  expect(screen.getByText("次回積立日：2026-10-31")).toBeTruthy();
  expect(screen.getByText("今月分の利息見込：1 gol")).toBeTruthy();
  expect(screen.getByText(/残高不足のため一部積立/)).toBeTruthy();
  fireEvent.press(screen.getByText("自動積立を停止"));
  await waitFor(() => expect(mockAmount).toHaveBeenCalledWith(0));
});
test("結果不明の引き出しは同じキーと金額で再送する", async () => {
  mockWithdraw.mockRejectedValueOnce(new Error("通信切断"));
  render(<SavingsScreen />);
  await screen.findByText("積立預金残高：300 gol");
  fireEvent.changeText(screen.getByLabelText("積立預金の引き出し額"), "100");
  fireEvent.press(screen.getByText("お財布へ引き出す"));
  await screen.findByText("同じ引き出しを再確認");
  await waitFor(() => expect(screen.getByText("同じ引き出しを再確認").parent?.props.accessibilityState?.disabled).not.toBe(true));
  fireEvent.press(screen.getByText("同じ引き出しを再確認"));
  await waitFor(() => expect(mockWithdraw).toHaveBeenCalledTimes(2));
  expect(mockWithdraw.mock.calls[1]).toEqual(mockWithdraw.mock.calls[0]);
  await screen.findByText("お財布へ引き出しました");
});
test("親は子の状況と家庭の積立日設定を利用できる", async () => {
  mockUser = { id: "parent", family_id: "family", role: "parent" };
  render(<SavingsScreen />);
  await screen.findByText("たろう");
  expect(screen.queryByLabelText("積立預金の引き出し額")).toBeNull();
  fireEvent.changeText(screen.getByLabelText("毎月の積立日"), "15");
  fireEvent.press(screen.getByText("積立日を保存"));
  await waitFor(() => expect(mockDay).toHaveBeenCalledWith(15));
});
test("取得失敗を残高0と表示しない", async () => {
  mockFetch.mockRejectedValueOnce(new Error("取得失敗"));
  render(<SavingsScreen />);
  await screen.findByText("積立預金を取得できませんでした。再読み込みしてください。");
  expect(screen.queryByText(/積立預金残高：/)).toBeNull();
});
