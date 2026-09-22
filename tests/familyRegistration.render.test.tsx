import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Alert } from "react-native";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockSignUpWithEmail = jest.fn<(...args: unknown[]) => Promise<any>>();

jest.mock("expo-router", () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/auth", () => ({
  signUpWithEmail: (...args: unknown[]) => mockSignUpWithEmail(...args),
}));

import FamilyRegistrationScreen from "../app/family-registration";
import { useAppStore } from "../store";

const user = {
  balance: 0,
  created_at: "2026-09-22T00:00:00Z",
  family_id: null,
  id: "00000000-0000-4000-8000-000000000024",
  name: "山田 太郎",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
});

function fillForm() {
  fireEvent.changeText(screen.getByLabelText("名前"), "山田 太郎");
  fireEvent.changeText(screen.getByLabelText("メールアドレス"), "family@example.com");
  fireEvent.changeText(screen.getByLabelText("パスワード"), "password123");
}

test("メール確認が必要な登録では案内を表示してログイン画面へ戻る", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockSignUpWithEmail.mockResolvedValue({
    data: { emailConfirmationRequired: true, user: null },
    error: null,
  });
  render(<FamilyRegistrationScreen />);
  fillForm();
  await act(async () => {
    fireEvent.press(screen.getByText("登録"));
  });

  expect(mockSignUpWithEmail).toHaveBeenCalledWith({
    email: "family@example.com",
    name: "山田 太郎",
    password: "password123",
    role: "parent",
  });
  expect(alert).toHaveBeenCalledWith(
    "登録手続きを受け付けました",
    "確認メールが届いた場合は、リンクを開いてからログインしてください。",
  );
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

test("登録時にセッションが発行されたらストアへ保存してホームへ進む", async () => {
  mockSignUpWithEmail.mockResolvedValue({
    data: { emailConfirmationRequired: false, user },
    error: null,
  });
  render(<FamilyRegistrationScreen />);
  fillForm();
  await act(async () => {
    fireEvent.press(screen.getByText("登録"));
  });

  expect(useAppStore.getState().user).toEqual(user);
  expect(mockReplace).toHaveBeenCalledWith("/");
});

test("登録に失敗したら理由を表示して遷移しない", async () => {
  mockSignUpWithEmail.mockResolvedValue({
    data: null,
    error: "登録に失敗しました。時間をおいて再度お試しください。",
  });
  render(<FamilyRegistrationScreen />);
  fillForm();
  await act(async () => {
    fireEvent.press(screen.getByText("登録"));
  });

  expect(screen.getByText("登録に失敗しました。時間をおいて再度お試しください。")).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("形式不正のメールと短いパスワードは送信しない", async () => {
  render(<FamilyRegistrationScreen />);
  fireEvent.changeText(screen.getByLabelText("名前"), "山田 太郎");
  fireEvent.changeText(screen.getByLabelText("メールアドレス"), "invalid-email");
  fireEvent.changeText(screen.getByLabelText("パスワード"), "short");
  fireEvent.press(screen.getByText("登録"));

  expect(await screen.findByText("メールアドレスの形式が正しくありません。")).toBeTruthy();
  expect(screen.getByText("パスワードは8文字以上で入力してください。")).toBeTruthy();
  expect(mockSignUpWithEmail).not.toHaveBeenCalled();
});
