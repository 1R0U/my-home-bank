import { render } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = false;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => mockCanGoBack,
    replace: mockReplace,
  }),
}));

import AuthCallbackScreen from "../app/auth/callback";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = false;
});

test("戻れるなら、ログイン画面（元の画面）へ戻る", () => {
  mockCanGoBack = true;
  render(<AuthCallbackScreen />);

  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test("戻れなければ、/ へ差し替える（/ へ Redirect にはしない。1R0Uレビュー対応）", () => {
  mockCanGoBack = false;
  render(<AuthCallbackScreen />);

  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/");
});
