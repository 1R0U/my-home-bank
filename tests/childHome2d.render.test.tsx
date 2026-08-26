import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush }),
}));

import ChildHomeScreen2D from "../components/ChildHomeScreen2D";

beforeEach(() => {
  jest.clearAllMocks();
});

test("3D版と同じ4つの建物を表示する", () => {
  render(<ChildHomeScreen2D />);

  expect(screen.getByRole("button", { name: "タスク" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "所持金" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ストア" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "履歴" })).toBeTruthy();
});

test("建物タップでMAP_ROUTESに対応する画面へ遷移する", () => {
  render(<ChildHomeScreen2D />);

  fireEvent.press(screen.getByRole("button", { name: "タスク" }));

  expect(mockPush).toHaveBeenCalledWith("/tasks-child");
});

test("遷移中は連続タップを無視する", () => {
  render(<ChildHomeScreen2D />);

  fireEvent.press(screen.getByRole("button", { name: "所持金" }));
  fireEvent.press(screen.getByRole("button", { name: "ストア" }));

  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/balance-child");
});
