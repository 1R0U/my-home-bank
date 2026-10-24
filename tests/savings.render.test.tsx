import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import AdultSavingsScreen from "../components/AdultSavingsScreen";
import ChildSavingsScreen from "../components/ChildSavingsScreen";

let mockUser = { id: "child", family_id: "family", role: "child" };
const mockFetch = jest.fn<(...args: any[]) => Promise<any>>();
const mockAmount = jest.fn<(...args: any[]) => Promise<any>>();
const mockDay = jest.fn<(...args: any[]) => Promise<any>>();
const mockWithdraw = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../store", () => ({ useActiveRole: () => mockUser.role, useCurrentUser: () => mockUser, useDataAccess: () => ({ canUseRealData: true }) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: unknown }) => children }));
jest.mock("expo-router", () => ({ router: { back: jest.fn() }, Stack: { Screen: () => null }, useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]) }));
jest.mock("../lib/savingsService", () => ({
  fetchSavingsSummary: (...args: unknown[]) => mockFetch(...args),
  setSavingsAmount: (...args: unknown[]) => mockAmount(...args),
  setSavingsDay: (...args: unknown[]) => mockDay(...args),
  withdrawSavings: (...args: unknown[]) => mockWithdraw(...args),
}));
// 親が子供ごとに銀行を使わないにしたか（Issue #348）。既定は使える
let mockBankAccess: "closed" | "loading" | "open" | "unknown" = "open";
const mockReloadAccess = jest.fn();
jest.mock("../lib/useChildFeatureRestrictions", () => ({
  useFeatureAccess: () => ({ access: mockBankAccess, reload: mockReloadAccess }),
}));
const summary = {
  transfer_day: 31, monthly_rate: .005,
  accounts: [{ user_id: "child", name: "たろう", balance: 300, monthly_amount: 100,
    next_transfer_date: "2026-10-31", estimated_interest: 1,
    history: [{ target_month: "2026-09-01", kind: "transfer", amount: 30, status: "partial" }] }],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockBankAccess = "open";
  mockUser = { id: "child", family_id: "family", role: "child" };
  mockFetch.mockResolvedValue(summary);
  mockAmount.mockResolvedValue(undefined);
  mockDay.mockResolvedValue(undefined);
  mockWithdraw.mockReset().mockResolvedValue(undefined);
});
test("子供用の画面では残高・次回日・利息見込・部分積立を確認し停止できる", async () => {
  await render(<ChildSavingsScreen />);
  await screen.findByText("積立預金残高：300 gol");
  expect(screen.getByText("次回積立日：2026-10-31")).toBeTruthy();
  expect(screen.getByText("今月分の利息見込：1 gol")).toBeTruthy();
  expect(screen.getByText(/残高不足のため一部積立/)).toBeTruthy();
  await fireEvent.press(screen.getByText("自動積立を停止"));
  await waitFor(() => expect(mockAmount).toHaveBeenCalledWith(0));
});
test("親が銀行を使わないにした子供には、積立の操作を出さず案内と戻るだけを出す（Issue #348）", async () => {
  mockBankAccess = "closed";
  await render(<ChildSavingsScreen />);
  expect(screen.getByLabelText("銀行は いま しまっているよ。つかいたいときは おとなに きいてみてね。")).toBeTruthy();
  expect(screen.queryByText("積立額を保存")).toBeNull();
  expect(screen.queryByText("お財布へ引き出す")).toBeNull();
  // 積立の情報も取りに行かない
  expect(mockFetch).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("戻る"));
  expect(require("expo-router").router.back).toHaveBeenCalled();
});
test("使えるか分からないときも積立の操作を出さず、もういちど ためせる（Issue #348）", async () => {
  for (const access of ["loading", "unknown"] as const) {
    mockBankAccess = access;
    const view = await render(<ChildSavingsScreen />);
    expect(screen.queryByText("積立額を保存")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    if (access === "unknown") {
      await fireEvent.press(screen.getByRole("button", { name: "もういちど ためす" }));
      expect(mockReloadAccess).toHaveBeenCalledTimes(1);
    } else {
      expect(screen.queryByRole("button", { name: "もういちど ためす" })).toBeNull();
    }
    await view.unmount();
  }
});
test("結果不明の引き出しは同じキーと金額で再送する", async () => {
  mockWithdraw.mockRejectedValueOnce(new Error("通信切断"));
  await render(<ChildSavingsScreen />);
  await screen.findByText("積立預金残高：300 gol");
  await fireEvent.changeText(screen.getByLabelText("積立預金の引き出し額"), "100");
  await fireEvent.press(screen.getByText("お財布へ引き出す"));
  await screen.findByText("同じ引き出しを再確認");
  await waitFor(() => expect(screen.getByText("同じ引き出しを再確認").parent?.props.accessibilityState?.disabled).not.toBe(true));
  await fireEvent.press(screen.getByText("同じ引き出しを再確認"));
  await waitFor(() => expect(mockWithdraw).toHaveBeenCalledTimes(2));
  expect(mockWithdraw.mock.calls[1]).toEqual(mockWithdraw.mock.calls[0]);
  await screen.findByText("お財布へ引き出しました");
});
test("大人用の画面では子の状況と家庭の積立日設定を利用できる", async () => {
  mockUser = { id: "parent", family_id: "family", role: "parent" };
  await render(<AdultSavingsScreen />);
  await screen.findByText("たろう");
  expect(screen.getByText("積立預金残高：300 gol")).toBeTruthy();
  expect(screen.queryByLabelText("積立預金の引き出し額")).toBeNull();
  expect(screen.queryByLabelText("毎月の積立額")).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("毎月の積立日"), "15");
  await fireEvent.press(screen.getByText("積立日を保存"));
  await waitFor(() => expect(mockDay).toHaveBeenCalledWith(15));
});
test("取得失敗を残高0と表示しない", async () => {
  mockFetch.mockRejectedValueOnce(new Error("取得失敗"));
  await render(<ChildSavingsScreen />);
  await screen.findByText("積立預金を取得できませんでした。再読み込みしてください。");
  expect(screen.queryByText(/積立預金残高：/)).toBeNull();
});
test("子供用の画面には家庭の積立日の設定を出さない", async () => {
  await render(<ChildSavingsScreen />);
  await screen.findByText("積立預金残高：300 gol");
  expect(screen.queryByLabelText("毎月の積立日")).toBeNull();
  expect(screen.queryByText("たろう")).toBeNull();
});
test("残高不足などで拒否された引き出しは、再送用の状態を捨てて入力し直せる", async () => {
  mockWithdraw.mockRejectedValueOnce({ code: "MHB02", message: "積立預金の残高が足りません" });
  await render(<ChildSavingsScreen />);
  await screen.findByText("積立預金残高：300 gol");
  await fireEvent.changeText(screen.getByLabelText("積立預金の引き出し額"), "100");
  await fireEvent.press(screen.getByText("お財布へ引き出す"));
  await waitFor(() => expect(mockWithdraw).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText("お財布へ引き出す").parent?.props.accessibilityState?.disabled).not.toBe(true));
  expect(screen.queryByText("同じ引き出しを再確認")).toBeNull();
});
