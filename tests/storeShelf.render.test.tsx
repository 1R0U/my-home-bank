import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import StoreShelf from "../components/store/StoreShelf";

const item = {
  id: "item-1",
  title: "テスト商品",
  description: "説明",
  image_url: null,
  price: 100,
  stock: 5,
  requested_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
};

test("onSelectItemが指定されている場合、タップすると正しいidで1回呼ばれる", () => {
  const onSelectItem = jest.fn();
  render(<StoreShelf items={[item]} onSelectItem={onSelectItem} />);

  const card = screen.getByRole("button", { name: /テスト商品/ });
  fireEvent.press(card);

  expect(onSelectItem).toHaveBeenCalledTimes(1);
  expect(onSelectItem).toHaveBeenCalledWith("item-1");
});

test("onSelectItemが未指定の場合、ボタンとして公開されない", () => {
  render(<StoreShelf items={[item]} />);

  expect(screen.queryByRole("button", { name: /テスト商品/ })).toBeNull();
});
