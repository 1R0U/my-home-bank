import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import StoreShelf from "../components/store/StoreShelf";

const item = {
  id: "item-1",
  family_id: "family-1",
  title: "テスト商品",
  description: "説明",
  image_url: null,
  price: 100,
  stock: 5,
  requested_by: "user-1",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

test("タップすると、そのアイテム自体でonSelectItemが1回呼ばれる", () => {
  const onSelectItem = jest.fn();
  render(<StoreShelf items={[item]} onSelectItem={onSelectItem} selectedItemId={null} />);

  const card = screen.getByRole("button", { name: /テスト商品/ });
  fireEvent.press(card);

  expect(onSelectItem).toHaveBeenCalledTimes(1);
  expect(onSelectItem).toHaveBeenCalledWith(item);
});

test("selectedItemIdと一致するカードは選択状態になる", () => {
  render(<StoreShelf items={[item]} onSelectItem={jest.fn()} selectedItemId="item-1" />);

  const card = screen.getByRole("button", { name: /テスト商品/ });
  expect(card.props.accessibilityState?.selected).toBe(true);
});

test("selectedItemIdと一致しないカードは選択状態にならない", () => {
  render(<StoreShelf items={[item]} onSelectItem={jest.fn()} selectedItemId="other-item" />);

  const card = screen.getByRole("button", { name: /テスト商品/ });
  expect(card.props.accessibilityState?.selected).toBe(false);
});
