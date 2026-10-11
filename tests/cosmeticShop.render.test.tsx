import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { ShopCatalogItem, User } from "../types";
import { formatGolForSpeech } from "../lib/amount";

/**
 * 子供用ストアの「きせかえ・かざり」の棚（Issue #225）。
 */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

// 家庭の商品の棚（3D）は、この検証では使わない
jest.mock("../components/store/StoreShelfScene", () => ({ StoreShelfScene: () => null }));

jest.mock("../lib/userService", () => ({
  fetchUserBalance: () => Promise.resolve(320),
}));

jest.mock("../lib/useStoreItems", () => ({
  useStoreItems: () => ({ error: null, isLive: true, items: [], loading: false, priceIndex: 100, reload: jest.fn() }),
}));

jest.mock("../lib/audio", () => ({
  AUDIO_SOURCES: { purchaseSuccess: 1, storeBgm: 2 },
  useLoopingAudio: () => ({ start: () => Promise.resolve(), stop: () => undefined }),
  useSoundEffect: () => () => Promise.resolve(),
}));

const mockReloadWardrobe = jest.fn(() => Promise.resolve());
jest.mock("../lib/useWardrobe", () => ({
  useWardrobe: () => ({ isReady: true, reload: mockReloadWardrobe, saveEquipment: jest.fn() }),
}));

const mockPurchaseShopItem = jest.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve("tx-1"));
jest.mock("../lib/shopService", () => ({
  ...jest.requireActual<typeof import("../lib/shopService")>("../lib/shopService"),
  purchaseShopItem: (...args: unknown[]) => mockPurchaseShopItem(...args),
}));

const mockReloadCatalog = jest.fn(() => Promise.resolve());
let mockCatalogItems: ShopCatalogItem[];
jest.mock("../lib/useShopCatalog", () => ({
  useShopCatalog: () => ({
    error: null,
    isLive: true,
    items: mockCatalogItems,
    loading: false,
    priceIndex: 105,
    reload: mockReloadCatalog,
  }),
}));

import ChildStoreScreen from "../components/ChildStoreScreen";

const strawHat: ShopCatalogItem = {
  asset_id: "wearable-straw-hat",
  base_price: 200,
  id: "shop-1",
  kind: "wearable",
  owned: false,
  price_index: 105,
  sale_price: 210,
  title: "むぎわらぼうし",
};
const lamp: ShopCatalogItem = {
  ...strawHat,
  asset_id: "decoration-lamp",
  id: "shop-2",
  kind: "decoration",
  owned: true,
  title: "ランプ",
};

const child: User = {
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
  id: "22222222-2222-2222-2222-222222222222",
  name: "たろう",
  role: "child",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalogItems = [strawHat, lamp];
  useAppStore.setState({ user: child });
});

function openCosmetics() {
  render(<ChildStoreScreen />);
  fireEvent.press(screen.getByRole("tab", { name: "きせかえ・かざり" }));
}

test("棚を切り替えると、きせかえとかざりが分かれて並ぶ", () => {
  openCosmetics();

  expect(screen.getByRole("header", { name: "きせかえ" })).toBeTruthy();
  expect(screen.getByRole("header", { name: "かざり" })).toBeTruthy();
  expect(screen.getByRole("button", { name: `むぎわらぼうし、${formatGolForSpeech(210)}` })).toBeTruthy();
});

test("もう持っている品は「もっている」と出し、選べない", () => {
  openCosmetics();

  const owned = screen.getByRole("button", { name: "ランプ、もっています" });
  expect(owned.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(owned);
  expect(screen.queryByText("ねだん")).toBeNull();
});

test("買うと、品・キー・画面の販売価格で購入し、閉じると品書き・持ちもの・残高を取り直す", async () => {
  openCosmetics();

  fireEvent.press(screen.getByRole("button", { name: `むぎわらぼうし、${formatGolForSpeech(210)}` }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  await waitFor(() => expect(screen.getByText("むぎわらぼうしを てにいれた！")).toBeTruthy());
  expect(mockPurchaseShopItem).toHaveBeenCalledWith("shop-1", expect.stringMatching(/^shop-purchase:/), 210);

  fireEvent.press(screen.getByRole("button", { name: "閉じる" }));
  expect(mockReloadCatalog).toHaveBeenCalledTimes(1);
  expect(mockReloadWardrobe).toHaveBeenCalledTimes(1);
});

test("所持ゴルが足りなければ、購入ボタンを押せない", () => {
  mockCatalogItems = [{ ...strawHat, sale_price: 5000 }];
  openCosmetics();

  fireEvent.press(screen.getByRole("button", { name: `むぎわらぼうし、${formatGolForSpeech(5000)}` }));
  const button = screen.getByRole("button", { name: "ゴル不足" });
  expect(button.props.accessibilityState).toMatchObject({ disabled: true });
});

test("価格が変わって断られたら、品書きを取り直して再確認を促す", async () => {
  mockPurchaseShopItem.mockRejectedValueOnce({ message: "表示後に価格が変わりました。商品一覧を更新してください" });
  openCosmetics();

  fireEvent.press(screen.getByRole("button", { name: `むぎわらぼうし、${formatGolForSpeech(210)}` }));
  fireEvent.press(screen.getByRole("button", { name: "購入する" }));

  await waitFor(() => expect(screen.getByText("価格が変わりました。もう一度確認してください")).toBeTruthy());
  expect(mockReloadCatalog).toHaveBeenCalledTimes(1);
});
