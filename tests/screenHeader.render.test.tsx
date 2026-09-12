import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

import ScreenHeader from "../components/ScreenHeader";

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
