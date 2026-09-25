import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSignInWithEmail = jest.fn<(...args: unknown[]) => Promise<any>>();
const mockSignInWithGoogle = jest.fn<(...args: unknown[]) => Promise<any>>();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/auth", () => ({
  signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
}));
jest.mock("../lib/googleAuth", () => ({
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
}));

import LoginScreen from "../app/login";
import { useAppStore } from "../store";

const user = {
  balance: 0,
  created_at: "2026-09-22T00:00:00Z",
  family_id: null,
  id: "00000000-0000-4000-8000-000000000024",
  name: "テスト親",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
});

test("Supabase認証に成功したらストアを更新してホームへ遷移する", async () => {
  mockSignInWithEmail.mockResolvedValue({ data: user, error: null });
  render(<LoginScreen />);

  fireEvent.changeText(screen.getByLabelText("メールアドレス"), "parent@example.com");
  fireEvent.changeText(screen.getByLabelText("パスワード"), "password123");
  fireEvent.press(screen.getByText("ログイン"));

  await waitFor(() => {
    expect(mockSignInWithEmail).toHaveBeenCalledWith("parent@example.com", "password123");
    expect(useAppStore.getState().user).toEqual(user);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});

test("認証に失敗したらエラーメッセージを表示して遷移しない", async () => {
  mockSignInWithEmail.mockResolvedValue({
    data: null,
    error: "メールアドレスまたはパスワードが違います。",
  });
  render(<LoginScreen />);

  fireEvent.changeText(screen.getByLabelText("メールアドレス"), "parent@example.com");
  fireEvent.changeText(screen.getByLabelText("パスワード"), "wrong-password");
  fireEvent.press(screen.getByText("ログイン"));

  expect(await screen.findByText("メールアドレスまたはパスワードが違います。")).toBeTruthy();
  expect(useAppStore.getState().user).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByLabelText("メールアドレス"), "updated@example.com");
  expect(screen.queryByText("メールアドレスまたはパスワードが違います。")).toBeNull();

  fireEvent.press(screen.getByText("ログイン"));
  expect(await screen.findByText("メールアドレスまたはパスワードが違います。")).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("パスワード"), "updated-password");
  expect(screen.queryByText("メールアドレスまたはパスワードが違います。")).toBeNull();
});

test("新規登録ボタンから家族登録画面へ進む", () => {
  render(<LoginScreen />);
  fireEvent.press(screen.getByText("新しいアカウントを登録"));
  expect(mockPush).toHaveBeenCalledWith("/family-registration");
});

test("Googleログインに成功したらストアを更新してホームへ遷移する", async () => {
  mockSignInWithGoogle.mockResolvedValue({ data: user, error: null });
  render(<LoginScreen />);

  fireEvent.press(screen.getByText("Googleでログイン"));

  await waitFor(() => {
    expect(mockSignInWithGoogle).toHaveBeenCalled();
    expect(useAppStore.getState().user).toEqual(user);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});

test("Google認証に失敗したらエラーメッセージを表示して遷移しない", async () => {
  mockSignInWithGoogle.mockResolvedValue({
    data: null,
    error: "ログインがキャンセルされました。",
  });
  render(<LoginScreen />);

  fireEvent.press(screen.getByText("Googleでログイン"));

  expect(await screen.findByText("ログインがキャンセルされました。")).toBeTruthy();
  expect(useAppStore.getState().user).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("Google認証中はメールログインのボタンも操作できない（連打防止）", async () => {
  let resolveGoogle: (value: unknown) => void = () => undefined;
  mockSignInWithGoogle.mockReturnValue(
    new Promise((resolve) => {
      resolveGoogle = resolve;
    }),
  );
  render(<LoginScreen />);

  fireEvent.press(screen.getByText("Googleでログイン"));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeDisabled();
  });
  expect(screen.getByRole("button", { name: "ログイン" })).toBeDisabled();

  resolveGoogle({ data: user, error: null });
  await waitFor(() => {
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
