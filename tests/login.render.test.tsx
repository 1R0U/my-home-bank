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
  ["大人として入る", MOCK_ACCOUNTS.parent.user],
  ["子供として入る", MOCK_ACCOUNTS.child.user],
])("%sでストアを更新してホームへ遷移する", async (label, expectedUser) => {
  render(<LoginScreen />);

  fireEvent.press(screen.getByText(label));

  await waitFor(() => {
    expect(useAppStore.getState().user).toEqual(expectedUser);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
