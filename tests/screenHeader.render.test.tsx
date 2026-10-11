import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    replace: (href: string) => mockReplace(href),
    canGoBack: () => mockCanGoBack,
  },
}));

import ScreenHeader from "../components/ScreenHeader";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
});

test("デフォルトでは戻るボタンを表示する", () => {
  render(<ScreenHeader title="設定" />);

  expect(screen.getByLabelText("前の画面に戻る")).toBeTruthy();
});

test("hideBackButtonを指定すると戻るボタンを表示しない", () => {
  render(<ScreenHeader hideBackButton title="設定" />);

  expect(screen.queryByLabelText("前の画面に戻る")).toBeNull();
});

test("タイトルはhideBackButtonの指定に関わらず表示する", () => {
  render(<ScreenHeader hideBackButton title="ストア" />);

  expect(screen.getByText("ストア")).toBeTruthy();
});

test("戻る先がある場合は直前の画面へ戻る", () => {
  render(<ScreenHeader title="りれき" />);

  fireEvent.press(screen.getByLabelText("前の画面に戻る"));

  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test("再起動や直接起動で戻る先がない場合はホームへ進む", () => {
  mockCanGoBack = false;
  render(<ScreenHeader title="りれき" />);

  fireEvent.press(screen.getByLabelText("前の画面に戻る"));

  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/");
});
