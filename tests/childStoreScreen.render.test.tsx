import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
import type { StoreItem, User } from "../types";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
}));

// デフォルトは未ログイン想定。ChildStoreScreen は null のときモックユーザーにフォールバックする。
// （ユーザー切替の回帰テストのために値を変更できるようにしている）
let mockLoggedInUser: User | null = null;
jest.mock("../store", () => ({
  useCurrentUser: () => mockLoggedInUser,
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
  mockLoggedInUser = null;
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

test("申請ボタンから商品追加申請画面へ遷移する", () => {
  render(<ChildStoreScreen />);

  const requestButton = screen.getByLabelText("新しい商品の追加を申請");
  expect(requestButton.props.accessibilityState?.disabled).not.toBe(true);

  fireEvent.press(requestButton);
  expect(router.push).toHaveBeenCalledWith("/store-item-request");
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

test("購入失敗時にエラーメッセージ（日本語）がモーダルに表示される", async () => {
  mockStoreItemsResult.isLive = true;
  // purchase_store_item（DB関数）は英語で raise exception する。画面には日本語で出す。
  mockPurchaseStoreItem.mockRejectedValueOnce(new Error("store item out of stock: item-1"));
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  await waitFor(() => expect(screen.getByText("在庫がありません")).toBeTruthy());
  // 失敗時は再取得もモーダルクローズもしない
  expect(mockReload).not.toHaveBeenCalled();
  expect(screen.getByText("ねだん")).toBeTruthy();
});

test("残高取得に失敗した場合、残高不足でも購入ボタンを無効化せず警告を表示する", async () => {
  const expensiveItem = { ...firstItem, id: "item-expensive", price: 9999 };
  mockStoreItemsResult = {
    items: [expensiveItem],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  };
  // モック残高（320pt）では到底足りない価格 9,999pt のアイテムで検証する
  mockFetchUserBalance.mockRejectedValueOnce(new Error("network error"));
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(expensiveItem) }));

  // 残高取得失敗が反映されるまでは「ポイント不足」→ フォールバック確定後は「購入する」に変わる
  const purchaseButton = await screen.findByRole("button", { name: "購入する" });
  expect(purchaseButton.props.accessibilityState.disabled).toBe(false);
  expect(screen.getByText("※ 残高が最新でない可能性があります")).toBeTruthy();
});

test("残高取得中にユーザーが切り替わっても、後から解決した古いリクエストの結果で上書きされない", async () => {
  mockStoreItemsResult.isLive = true;

  const userA: User = {
    id: "user-child-a",
    name: "たろう",
    role: "child",
    balance: 320,
    created_at: "2026-07-01T00:00:00Z",
  };
  const userB: User = { ...userA, id: "user-child-b", name: "はなこ" };

  let resolveFirstRequest: (balance: number) => void = () => undefined;
  const firstRequest = new Promise<number>((resolve) => {
    resolveFirstRequest = resolve;
  });
  mockFetchUserBalance.mockImplementationOnce(() => firstRequest).mockResolvedValueOnce(999);

  mockLoggedInUser = userA;
  const { rerender } = render(<ChildStoreScreen />);

  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalledTimes(1));

  // 1回目のリクエストが解決する前に、ユーザーが切り替わって2回目のリクエストが走る
  mockLoggedInUser = userB;
  rerender(<ChildStoreScreen />);

  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText("999")).toBeTruthy());

  // 先に開始した(遅い)1回目のリクエストが後から解決しても、最新の表示を上書きしない
  await act(async () => {
    resolveFirstRequest(111);
    await firstRequest;
  });

  expect(screen.getByText("999")).toBeTruthy();
  expect(screen.queryByText("111")).toBeNull();
});
