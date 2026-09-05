import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ChildStoreScreen from "../components/ChildStoreScreen";
import { MOCK_STORE_ITEMS } from "../constants/mockData";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
}));

const [firstItem, secondItem] = MOCK_STORE_ITEMS;

function cardLabel(item: (typeof MOCK_STORE_ITEMS)[number]) {
  return `${item.title}、${item.price.toLocaleString("ja-JP")}ポイント`;
}

test("商品をタップするまでは詳細エリアを表示しない", () => {
  render(<ChildStoreScreen />);

  expect(screen.queryByText(firstItem.description)).toBeNull();
});

test("棚の商品をタップすると画面下部に詳細が表示される", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));

  const detail = within(screen.getByTestId("store-item-detail"));
  expect(detail.getByText(firstItem.title)).toBeTruthy();
  expect(detail.getByText(firstItem.description)).toBeTruthy();
  expect(detail.getByText(`在庫 ${firstItem.stock}`)).toBeTruthy();
});

test("別の商品をタップすると詳細表示がその商品に切り替わる", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));
  fireEvent.press(screen.getByRole("button", { name: cardLabel(secondItem) }));

  const detail = within(screen.getByTestId("store-item-detail"));
  expect(detail.getByText(secondItem.title)).toBeTruthy();
  expect(detail.queryByText(firstItem.description)).toBeNull();
});

test("選択中の商品はaccessibilityStateのselectedがtrueになる", () => {
  render(<ChildStoreScreen />);

  const button = screen.getByRole("button", { name: cardLabel(firstItem) });
  fireEvent.press(button);

  expect(button.props.accessibilityState.selected).toBe(true);
});

test("閉じるボタンで詳細エリアを非表示にする", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));
  expect(screen.getByTestId("store-item-detail")).toBeTruthy();

  fireEvent.press(screen.getByRole("button", { name: "詳細を閉じる" }));

  expect(screen.queryByTestId("store-item-detail")).toBeNull();
});

test("詳細エリア下部に無効化された購入ボタンを表示する", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));

  const purchaseButton = screen.getByRole("button", { name: "購入する" });
  expect(purchaseButton.props.accessibilityState.disabled).toBe(true);
});

test("戻るボタンで直前の画面に戻る", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});
