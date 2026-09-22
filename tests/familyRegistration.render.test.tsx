import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

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

beforeEach(() => {
  jest.clearAllMocks();
});

function fillForm() {
  fireEvent.changeText(screen.getByLabelText("名前"), "山田 太郎");
  fireEvent.changeText(screen.getByLabelText("メールアドレス"), "family@example.com");
  fireEvent.changeText(screen.getByLabelText("パスワード"), "password123");
}

test("登録に成功したらAuthとusersへ渡す情報を整え、ログイン画面へ戻る", async () => {
  mockSignUpWithEmail.mockResolvedValue({ data: {}, error: null });
  render(<FamilyRegistrationScreen />);
  fillForm();
  fireEvent.press(screen.getByText("登録"));

  await waitFor(() => {
    expect(mockSignUpWithEmail).toHaveBeenCalledWith({
      email: "family@example.com",
      name: "山田 太郎",
      password: "password123",
      role: "parent",
    });
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});

test("登録に失敗したら理由を表示して遷移しない", async () => {
  mockSignUpWithEmail.mockResolvedValue({ data: null, error: "このメールアドレスは既に登録されています。" });
  render(<FamilyRegistrationScreen />);
  fillForm();
  fireEvent.press(screen.getByText("登録"));

  expect(await screen.findByText("このメールアドレスは既に登録されています。")).toBeTruthy();
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
