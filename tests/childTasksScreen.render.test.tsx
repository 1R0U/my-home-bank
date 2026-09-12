import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ChildTasksScreen from "../components/ChildTasksScreen";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}));

test("戻るボタンで直前の画面に戻る", () => {
  render(<ChildTasksScreen />);

  fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});

test("報告ボタンから自主報告画面へ遷移する", () => {
  render(<ChildTasksScreen />);

  fireEvent.press(screen.getByRole("button", { name: "タスクとして発行されていない家事を報告" }));

  expect(router.push).toHaveBeenCalledWith("/task-report");
});
