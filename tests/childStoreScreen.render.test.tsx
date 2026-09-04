import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ChildStoreScreen from "../components/ChildStoreScreen";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}));

test("戻るボタンで直前の画面に戻る", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});

test("申請ボタンから商品追加申請画面へ遷移する", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: "新しい商品の追加を申請" }));

  expect(router.push).toHaveBeenCalledWith("/store-item-request");
});
