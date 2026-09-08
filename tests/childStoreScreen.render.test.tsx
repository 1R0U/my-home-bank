import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
import type { StoreItem } from "../types";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}));

// 未ログイン想定。ChildStoreScreen は null のときモックユーザーにフォールバックする。
jest.mock("../store", () => ({
  useCurrentUser: () => null,
}));

const mockFetchUserBalance = jest.fn<(...args: unknown[]) => Promise<number>>(() => Promise.resolve(320));
jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
}));

const mockPurchaseStoreItem = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
jest.mock("../lib/storeService", () => ({
  purchaseStoreItem: (...args: unknown[]) => mockPurchaseStoreItem(...args),
}));

const mockReload = jest.fn();
type UseStoreItemsResult = {
  items: StoreItem[];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  reload: () => void;
};
let mockStoreItemsResult: UseStoreItemsResult;
jest.mock("../lib/useStoreItems", () => ({
  useStoreItems: () => mockStoreItemsResult,
}));

import ChildStoreScreen from "../components/ChildStoreScreen";

const [firstItem] = MOCK_STORE_ITEMS;

function cardLabel(item: StoreItem) {
  return `${item.title}、${item.price.toLocaleString("ja-JP")}ポイント`;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreItemsResult = {
    items: MOCK_STORE_ITEMS,
    loading: false,
    error: null,
    isLive: false,
    reload: mockReload,
  };
});

test("商品をタップするまでは購入確認モーダルを表示しない", () => {
  render(<ChildStoreScreen />);

  expect(screen.queryByText(firstItem.description)).toBeNull();
  expect(screen.queryByText("ねだん")).toBeNull();
});

test("商品をタップすると購入確認モーダルが表示される", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));

  expect(screen.getByText(firstItem.description)).toBeTruthy();
  expect(screen.getByText("ねだん")).toBeTruthy();
  expect(screen.getByText("のこり在庫")).toBeTruthy();
  expect(screen.getByRole("button", { name: "購入する" })).toBeTruthy();
});

test("戻るボタンで直前の画面に戻る", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});

test("商品追加申請ボタンは現状無効化されており、遷移は発生しない", () => {
  render(<ChildStoreScreen />);

  const requestButton = screen.getByLabelText("新しい商品の追加を申請");
  expect(requestButton.props.accessibilityState.disabled).toBe(true);

  fireEvent.press(requestButton);
  expect(router.push).not.toHaveBeenCalled();
});

test("ストアアイテムの取得に失敗した場合、エラーと再試行ボタンを表示する", () => {
  mockStoreItemsResult = {
    items: [],
    loading: false,
    error: "アイテムの取得に失敗しました",
    isLive: true,
    reload: mockReload,
  };
  render(<ChildStoreScreen />);

  expect(screen.getByText("アイテムの取得に失敗しました")).toBeTruthy();

  const retryButton = screen.getByRole("button", { name: "アイテムの取得を再試行" });
  fireEvent.press(retryButton);

  expect(mockReload).toHaveBeenCalledTimes(1);
});

test("購入ボタンを押すと purchaseStoreItem が itemId・userId 付きで呼ばれる", async () => {
  mockStoreItemsResult.isLive = true;
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  await waitFor(() => expect(mockPurchaseStoreItem).toHaveBeenCalledTimes(1));
  // userId は未ログイン時のフォールバック先 MOCK_CURRENT_USER（user-child-1）
  expect(mockPurchaseStoreItem).toHaveBeenCalledWith(firstItem.id, "user-child-1");
});

test("購入成功時に商品一覧と残高が再取得される", async () => {
  mockStoreItemsResult.isLive = true;
  render(<ChildStoreScreen />);

  // マウント時の残高取得が終わってから、購入後の再取得だけを検証する
  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalled());
  mockFetchUserBalance.mockClear();

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalledTimes(1));
  // 購入成功でモーダルが閉じる
  await waitFor(() => expect(screen.queryByText("ねだん")).toBeNull());
});

test("購入失敗時にエラーメッセージがモーダルに表示される", async () => {
  mockStoreItemsResult.isLive = true;
  mockPurchaseStoreItem.mockRejectedValueOnce(new Error("在庫が足りません"));
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  await waitFor(() => expect(screen.getByText("在庫が足りません")).toBeTruthy());
  // 失敗時は再取得もモーダルクローズもしない
  expect(mockReload).not.toHaveBeenCalled();
  expect(screen.getByText("ねだん")).toBeTruthy();
});
