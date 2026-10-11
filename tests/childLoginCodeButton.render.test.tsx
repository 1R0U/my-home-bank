import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
const mockIssue = jest.fn<(...args: unknown[]) => Promise<any>>();
let mockBlur: (() => void) | undefined;
jest.mock("expo-router", () => ({ useFocusEffect: (effect: () => (() => void)) => { mockBlur = effect(); } }));
jest.mock("../lib/childLoginService", () => ({ issueChildLoginCode: (...args: unknown[]) => mockIssue(...args) }));
import ChildLoginCodeButton from "../components/settings/ChildLoginCodeButton";
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockIssue.mockResolvedValue({ code: "ABCDEFGH", expiresAt: new Date(Date.now() + 600_000).toISOString() }); });
afterEach(() => jest.useRealTimers());
const issue = async () => { await act(async () => fireEvent.press(screen.getByLabelText("たろうさんのログインコードを発行"))); };
test("選んだ子供のコードと期限、古い端末の失効について表示する", async () => {
  render(<ChildLoginCodeButton childId="child" name="たろう" enabled />);
  await issue();
  expect(mockIssue).toHaveBeenCalledWith("child");
  expect(screen.getByText("ABCDEFGH")).toBeTruthy();
  expect(screen.getByText(/以前の端末は使えなくなります/)).toBeTruthy();
  act(() => jest.advanceTimersByTime(600_001));
  expect(screen.queryByText("ABCDEFGH")).toBeNull();
  expect(screen.getByText(/有効期限が切れました/)).toBeTruthy();
});
test("画面を離れたらコードを破棄する", async () => {
  render(<ChildLoginCodeButton childId="child" name="たろう" enabled />);
  await issue();
  act(() => mockBlur?.());
  expect(screen.queryByText("ABCDEFGH")).toBeNull();
});
test("権限がないと発行できず、失敗理由を表示する", async () => {
  const view = render(<ChildLoginCodeButton childId="child" name="たろう" enabled={false} />);
  await issue();
  expect(mockIssue).not.toHaveBeenCalled();
  view.rerender(<ChildLoginCodeButton childId="child" name="たろう" enabled />);
  mockIssue.mockRejectedValue(new Error("30秒待ってください"));
  await issue();
  expect(screen.getByText("30秒待ってください")).toBeTruthy();
});
test("別利用者への切替中に遅れて返ったコードは表示しない", async () => {
  let finish!: (value: any) => void;
  mockIssue.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const view = render(<ChildLoginCodeButton childId="child" name="たろう" enabled />);
  fireEvent.press(screen.getByLabelText("たろうさんのログインコードを発行"));
  view.rerender(<ChildLoginCodeButton childId="other" name="はなこ" enabled />);
  await act(async () => finish({ code: "ABCDEFGH", expiresAt: new Date(Date.now() + 600_000).toISOString() }));
  expect(screen.queryByText("ABCDEFGH")).toBeNull();
});
