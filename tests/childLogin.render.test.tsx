import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockLogin = jest.fn<(...args: unknown[]) => Promise<any>>();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), canDismiss: () => true, dismissAll: () => mockDismissAll() },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/childLoginService", () => ({
  ...jest.requireActual<typeof import("../lib/childLoginService")>("../lib/childLoginService"),
  signInWithChildCode: (...args: unknown[]) => mockLogin(...args),
}));
import ChildLoginScreen from "../app/child-login";
import { useAppStore } from "../store";
const child = { id: "child", family_id: "family", role: "child" as const, name: "たろう", balance: 0, created_at: "2026-10-10" };
beforeEach(() => { jest.clearAllMocks(); useAppStore.setState({ user: null }); mockLogin.mockResolvedValue(child); });
test("メールやパスワードを求めず、8文字のコードでログインして履歴を消す", async () => {
  render(<ChildLoginScreen />);
  expect(screen.queryByLabelText("メールアドレス")).toBeNull();
  expect(screen.getByRole("button", { name: "はじめる" }).props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByLabelText("ログインコード"), "abcdefgh");
  await act(async () => { fireEvent.press(screen.getByText("はじめる")); });
  expect(mockLogin).toHaveBeenCalledWith("abcdefgh");
  expect(useAppStore.getState().user).toEqual(child);
  expect(mockDismissAll).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/");
  expect(screen.getByLabelText("ログインコード").props.value).toBe("");
});
test("失敗は画面へ表示し、コードを直すと消える", async () => {
  mockLogin.mockRejectedValue(new Error("コードの期限が切れています"));
  render(<ChildLoginScreen />);
  fireEvent.changeText(screen.getByLabelText("ログインコード"), "ABCDEFGH");
  await act(async () => { fireEvent.press(screen.getByText("はじめる")); });
  expect(screen.getByText("コードの期限が切れています")).toBeTruthy();
  expect(useAppStore.getState().user).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("ログインコード"), "ABCDEFG2");
  expect(screen.queryByText("コードの期限が切れています")).toBeNull();
});
test("処理中は二重送信しない", async () => {
  let finish!: (value: any) => void;
  mockLogin.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<ChildLoginScreen />);
  fireEvent.changeText(screen.getByLabelText("ログインコード"), "ABCDEFGH");
  fireEvent.press(screen.getByText("はじめる"));
  fireEvent(screen.getByLabelText("ログインコード"), "submitEditing");
  expect(mockLogin).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("ログインコード").props.editable).toBe(false);
  await act(async () => finish(child));
});
