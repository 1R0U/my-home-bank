import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import { MOCK_STORE_ITEMS } from "../constants/mockData";
import { useAppStore } from "../store";
import type { StoreItem, User } from "../types";
import { AMOUNT_UNITS, formatAmountWithUnit } from "../lib/amount";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
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

// UUID形式のIDでログインさせる。canUseRealData（実データの読み書き可否）は
// ログイン中かつUUID形式のときだけ true になるため（#174）、購入・残高取得に
// 関わるテストはこの形のユーザーでログインさせる必要がある。
const uuidUser: User = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "たろう",
  role: "child",
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

function cardLabel(item: StoreItem) {
  return `${item.title}、${formatAmountWithUnit(item.price, AMOUNT_UNITS.spoken)}`;
}

// 詳細パネルを開いてから、その中の「購入する」ボタンを押して購入確認モーダルを開く。
// 一覧のカードをタップしただけでは詳細パネルが開くだけで、モーダルはまだ開かない。
// モーダルが開くと、重複を避けるため詳細パネル側の「購入する」ボタンは隠れる。
function openPurchaseModal(item: StoreItem) {
  fireEvent.press(screen.getByRole("button", { name: cardLabel(item) }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));
}

// 購入確認モーダルを開いた状態から、モーダル自身の「購入する」ボタンを押して
// 実際に購入を確定させる（purchaseStoreItem を呼び出す）。
function confirmPurchase(item: StoreItem) {
  openPurchaseModal(item);
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
  mockStoreItemsResult = {
    items: MOCK_STORE_ITEMS,
    loading: false,
    error: null,
    isLive: false,
    reload: mockReload,
  };
});

test("商品をタップするまでは詳細パネルも購入確認モーダルも表示しない", () => {
  render(<ChildStoreScreen />);

  expect(screen.queryByText(firstItem.description)).toBeNull();
  expect(screen.queryByText("ねだん")).toBeNull();
});

test("商品をタップすると詳細パネルが表示されるが、購入確認モーダルはまだ表示しない", () => {
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(firstItem) }));

  expect(screen.getByText(firstItem.description)).toBeTruthy();
  expect(screen.getByRole("button", { name: "購入する" })).toBeTruthy();
  // 詳細パネルの時点ではまだ購入確認モーダル（「ねだん」の行）は開いていない
  expect(screen.queryByText("ねだん")).toBeNull();
});

test("詳細パネルの購入するボタンを押すと購入確認モーダルが表示される", () => {
  render(<ChildStoreScreen />);

  openPurchaseModal(firstItem);

  expect(screen.getByText("ねだん")).toBeTruthy();
  expect(screen.getByText("のこり在庫")).toBeTruthy();
  // ラベルの存在だけでなく、選択した商品自身の価格・在庫の実値が表示されて
  // いることを検証する。ラベルだけの確認では、モーダルに別商品の値が誤って
  // 表示されていても検知できない。
  expect(screen.getByText(formatAmountWithUnit(firstItem.price, AMOUNT_UNITS.p))).toBeTruthy();
  expect(screen.getByText(String(firstItem.stock))).toBeTruthy();
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

test("取得完了後にアイテムが0件だった場合は空状態のメッセージを表示する", () => {
  mockStoreItemsResult = {
    items: [],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  };
  render(<ChildStoreScreen />);

  expect(screen.getByText("いまはならんでいる商品がありません")).toBeTruthy();
});

test("取得中（0件）はまだ空状態のメッセージを表示しない", () => {
  mockStoreItemsResult = {
    items: [],
    loading: true,
    error: null,
    isLive: true,
    reload: mockReload,
  };
  render(<ChildStoreScreen />);

  expect(screen.queryByText("いまはならんでいる商品がありません")).toBeNull();
});

test("開発用クイックログイン（非UUIDのモックID）では isLive が true でも購入できず、プレビュー中の表示になる", async () => {
  // users.id は uuid 型。モックIDで問い合わせると uuid のパースに失敗するため、
  // 実APIを叩かず、購入ボタンも無効化する（#174）。
  mockStoreItemsResult.isLive = true;
  useAppStore.setState({
    user: { id: "user-child-1", name: "たろう", role: "child", balance: 320, created_at: "2026-07-01T00:00:00Z" },
  });
  render(<ChildStoreScreen />);

  openPurchaseModal(firstItem);

  const purchaseButton = screen.getByRole("button", { name: "購入する" });
  expect(purchaseButton.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("※ プレビュー中は購入できません")).toBeTruthy();

  fireEvent.press(purchaseButton);
  expect(mockPurchaseStoreItem).not.toHaveBeenCalled();
});

test("購入ボタンを押すと purchaseStoreItem が itemId・userId 付きで呼ばれる", async () => {
  mockStoreItemsResult.isLive = true;
  useAppStore.setState({ user: uuidUser });
  render(<ChildStoreScreen />);

  confirmPurchase(firstItem);

  await waitFor(() => expect(mockPurchaseStoreItem).toHaveBeenCalledTimes(1));
  expect(mockPurchaseStoreItem).toHaveBeenCalledWith(firstItem.id, uuidUser.id);
});

test("購入成功時にはまず成功メッセージを表示し、閉じる操作で一覧と残高が再取得される", async () => {
  mockStoreItemsResult.isLive = true;
  useAppStore.setState({ user: uuidUser });
  render(<ChildStoreScreen />);

  // マウント時の残高取得が終わってから、購入後の再取得だけを検証する
  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalled());
  mockFetchUserBalance.mockClear();

  confirmPurchase(firstItem);

  // 購入完了直後は成功メッセージを表示し、まだ再取得もモーダルクローズもしない
  // （「買えたのか」が子供に伝わるように、閉じる操作までモーダルを残す）
  await waitFor(() =>
    expect(screen.getByText(`${firstItem.title}を こうにゅうしました！`)).toBeTruthy(),
  );
  expect(mockReload).not.toHaveBeenCalled();
  // 成功表示中は購入前の古い金額（ねだん・のこり在庫・所持ポイント）を出さない
  // （残高更新前の値が成功メッセージと並んで「引かれていない」ように見えるのを防ぐ）
  // 「所持ポイント」は画面上部の残高バッジにも表示されるため、ここでは
  // モーダル固有のラベル（ねだん・のこり在庫）で検証する。
  expect(screen.queryByText("ねだん")).toBeNull();
  expect(screen.queryByText("のこり在庫")).toBeNull();

  // 閉じる操作で一覧・残高の再取得とモーダルクローズが行われる
  fireEvent.press(screen.getByRole("button", { name: "閉じる" }));

  await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("ねだん")).toBeNull());
});

test("購入失敗時にエラーメッセージ（日本語）がモーダルに表示される", async () => {
  mockStoreItemsResult.isLive = true;
  useAppStore.setState({ user: uuidUser });
  // purchase_store_item（DB関数）は英語で raise exception する。画面には日本語で出す。
  mockPurchaseStoreItem.mockRejectedValueOnce(new Error("store item out of stock: item-1"));
  render(<ChildStoreScreen />);

  confirmPurchase(firstItem);

  await waitFor(() => expect(screen.getByText("在庫がありません")).toBeTruthy());
  // 失敗時は再取得もモーダルクローズもしない
  expect(mockReload).not.toHaveBeenCalled();
  expect(screen.getByText("ねだん")).toBeTruthy();
});

test("購入失敗時、Supabaseが返すプレーンオブジェクト形式のエラーでも日本語で表示される", async () => {
  mockStoreItemsResult.isLive = true;
  useAppStore.setState({ user: uuidUser });
  // postgrest-js の rpc() は Error インスタンスではなく、レスポンスボディを
  // JSON.parse しただけのプレーンオブジェクトを返す。purchaseStoreItem はこれを
  // そのまま throw しているため、実際にはこの形でエラーが飛んでくる。
  mockPurchaseStoreItem.mockRejectedValueOnce({
    message: "store item out of stock: item-1",
    details: "",
    hint: "",
    code: "P0001",
  });
  render(<ChildStoreScreen />);

  confirmPurchase(firstItem);

  await waitFor(() => expect(screen.getByText("在庫がありません")).toBeTruthy());
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
  useAppStore.setState({ user: uuidUser });
  // モック残高（320pt）では到底足りない価格 9,999pt のアイテムで検証する
  mockFetchUserBalance.mockRejectedValueOnce(new Error("network error"));
  render(<ChildStoreScreen />);

  fireEvent.press(screen.getByRole("button", { name: cardLabel(expensiveItem) }));
  // 詳細パネルの購入するボタンを押して購入確認モーダルを開く
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  // 残高取得失敗が反映されるまでは「ポイント不足」→ フォールバック確定後は「購入する」に変わる
  const purchaseButton = await screen.findByRole("button", { name: "購入する" });
  expect(purchaseButton.props.accessibilityState.disabled).toBe(false);
  expect(screen.getByText("※ 残高が最新でない可能性があります")).toBeTruthy();
});

test("残高取得中にユーザーが切り替わっても、後から解決した古いリクエストの結果で上書きされない", async () => {
  mockStoreItemsResult.isLive = true;

  const userA: User = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "たろう",
    role: "child",
    balance: 320,
    created_at: "2026-07-01T00:00:00Z",
  };
  const userB: User = { ...userA, id: "22222222-2222-2222-2222-222222222222", name: "はなこ" };

  let resolveFirstRequest: (balance: number) => void = () => undefined;
  const firstRequest = new Promise<number>((resolve) => {
    resolveFirstRequest = resolve;
  });
  mockFetchUserBalance.mockImplementationOnce(() => firstRequest).mockResolvedValueOnce(999);

  useAppStore.setState({ user: userA });
  const { rerender } = render(<ChildStoreScreen />);

  await waitFor(() => expect(mockFetchUserBalance).toHaveBeenCalledTimes(1));

  // 1回目のリクエストが解決する前に、ユーザーが切り替わって2回目のリクエストが走る
  useAppStore.setState({ user: userB });
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
