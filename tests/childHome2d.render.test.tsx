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
  expect(screen.getByRole("button", { name: "銀行" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ストア" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "履歴" })).toBeTruthy();
});

test("建物タップでロールに対応する画面へ遷移する（未ログイン時は子供用）", () => {
  render(<ChildHomeScreen2D />);

  fireEvent.press(screen.getByRole("button", { name: "タスク" }));

  expect(mockPush).toHaveBeenCalledWith("/tasks-child");
});

test("遷移中は連続タップを無視する", () => {
  render(<ChildHomeScreen2D />);

  fireEvent.press(screen.getByRole("button", { name: "銀行" }));
  fireEvent.press(screen.getByRole("button", { name: "ストア" }));

  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/bank");
});

test("テレポートで出入りする自分の家・家の出口は、押しても反応しないのでボタンを出さない（Issue #444）", () => {
  render(<ChildHomeScreen2D />);

  expect(screen.queryByRole("button", { name: "自分の家" })).toBeNull();
  expect(screen.queryByRole("button", { name: "家の出口" })).toBeNull();
  // 家の中にあっても画面遷移で行くクローゼット（きがえ）は出す
  fireEvent.press(screen.getByRole("button", { name: "クローゼット" }));
  expect(mockPush).toHaveBeenCalledWith("/wardrobe");
});
