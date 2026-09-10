import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import type { StoreItem } from "../types";

// Canvas は expo-gl の GL コンテキストが必要で jest 環境では描画できないため、
// 3Dシーン部分はスタブ化し、RN側のアクセシブルなオーバーレイだけを検証する。
jest.mock("@react-three/fiber/native", () => ({
  Canvas: () => null,
  useLoader: () => ({}),
}));
jest.mock("expo-asset", () => ({
  Asset: { fromURI: () => ({ downloadAsync: jest.fn(), localUri: null, uri: "" }) },
}));

import { StoreShelfScene } from "../components/store/StoreShelfScene";

function makeItem(id: string, title: string, price: number): StoreItem {
  return {
    id,
    title,
    price,
    description: "",
    image_url: "",
    stock: 1,
    requested_by: "u",
    created_at: "2026-01-01T00:00:00Z",
  };
}

const shelves = [[makeItem("a", "アイテムA", 100), makeItem("b", "アイテムB", 200)]];

test("アクセシブルなボタンから商品を選択できる（3Dタップに依存しない）", () => {
  const onSelectItem = jest.fn();
  render(<StoreShelfScene onSelectItem={onSelectItem} selectedItemId={null} shelves={shelves} />);

  fireEvent.press(screen.getByRole("button", { name: "アイテムA、100ポイント" }));

  expect(onSelectItem).toHaveBeenCalledTimes(1);
  expect(onSelectItem).toHaveBeenCalledWith(shelves[0][0]);
});

test("選択中の商品はアクセシブルボタンの accessibilityState.selected が true になる", () => {
  render(<StoreShelfScene onSelectItem={jest.fn()} selectedItemId="b" shelves={shelves} />);

  expect(
    screen.getByRole("button", { name: "アイテムB、200ポイント" }).props.accessibilityState.selected,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "アイテムA、100ポイント" }).props.accessibilityState.selected,
  ).toBe(false);
});
