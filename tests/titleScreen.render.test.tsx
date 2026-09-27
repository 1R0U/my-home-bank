import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));

import TitleScreen from "../app/title";

beforeEach(() => {
  jest.clearAllMocks();
});

test("タイトルと2つのボタンを表示する", () => {
  render(<TitleScreen />);
  expect(screen.getByText("おうちギルド")).toBeTruthy();
  expect(screen.getByText("ぼうけんをはじめる")).toBeTruthy();
  expect(screen.getByText("ギルドにとうろくする")).toBeTruthy();
});

test("看板の文字は背景のボタンにまとめず、個別に読み上げられる", () => {
  render(<TitleScreen />);
  expect(screen.getByRole("header", { name: "おうちギルド" })).toBeTruthy();
  expect(screen.getByTestId("title-stage").props.accessible).toBe(false);
});

test("「ぼうけんをはじめる」でログイン画面へ進む", () => {
  render(<TitleScreen />);
  fireEvent.press(screen.getByText("ぼうけんをはじめる"));
  expect(mockPush).toHaveBeenCalledWith("/login");
});

test("背景をタップしてもログイン画面へ進む", () => {
  render(<TitleScreen />);
  fireEvent.press(screen.getByTestId("title-stage"));
  expect(mockPush).toHaveBeenCalledWith("/login");
});

test("「ギルドにとうろくする」で家族登録画面へ進む", () => {
  render(<TitleScreen />);
  fireEvent.press(screen.getByText("ギルドにとうろくする"));
  expect(mockPush).toHaveBeenCalledWith("/family-registration");
});
