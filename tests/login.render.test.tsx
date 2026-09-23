import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockReplace = jest.fn();
jest.mock("../lib/mockLoginEnvironment", () => ({ SHOULD_ENABLE_MOCK_LOGIN: true }));
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() },
  Stack: { Screen: () => null },
}));

import LoginScreen from "../app/login";
import { MOCK_ACCOUNTS } from "../lib/mockAuth";
import { useAppStore } from "../store";

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
});

test.each([
  [MOCK_ACCOUNTS.parent],
  [MOCK_ACCOUNTS.child],
])("モック認証でストアを更新してホームへ遷移する", async (account) => {
  render(<LoginScreen />);

  fireEvent.changeText(screen.getByLabelText("メールアドレス"), account.email);
  fireEvent.changeText(screen.getByLabelText("パスワード"), account.password);
  fireEvent.press(screen.getByText("ログイン"));

  await waitFor(() => {
    expect(useAppStore.getState().user).toEqual(account.user);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
