import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { StoreItem } from "../types";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("../store", () => ({
  useCurrentUser: () => ({
    id: "user-parent-1",
    name: "お父さん",
    role: "parent",
    balance: 500,
    created_at: "2026-07-01T00:00:00Z",
  }),
}));

const mockCreateStoreItem = jest.fn<(...args: unknown[]) => Promise<unknown>>(() =>
  Promise.resolve({ id: "new-item" }),
);
const mockFetchFamilyUsers = jest.fn<(...args: unknown[]) => Promise<{ id: string; name: string }[]>>(
  () => Promise.resolve([{ id: "user-parent-1", name: "テスト親" }]),
);
jest.mock("../lib/storeService", () => ({
  createStoreItem: (...args: unknown[]) => mockCreateStoreItem(...args),
  fetchFamilyUsers: (...args: unknown[]) => mockFetchFamilyUsers(...args),
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

import ParentStoreScreen from "../components/ParentStoreScreen";

const item: StoreItem = {
  id: "item-1",
  title: "夕飯リクエスト権",
  description: "その日の夜ご飯のメニューをリクエストできる",
  image_url: null,
  price: 100,
  stock: 999999,
  requested_by: "user-parent-1",
  created_at: "2026-07-01T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreItemsResult = {
    items: [item],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  };
});

function openManageTab() {
  fireEvent.press(screen.getByRole("button", { name: "アイテム管理" }));
}

function fillValidForm() {
  fireEvent.changeText(screen.getByLabelText("題名"), "ゲーム1時間延長券");
  fireEvent.changeText(screen.getByLabelText("Pt"), "80");
}

test("入力が不十分な間は「追加」ボタンが無効化される", () => {
  render(<ParentStoreScreen />);
  openManageTab();

  const submit = screen.getByLabelText("アイテムを追加");
  expect(submit.props.accessibilityState.disabled).toBe(true);

  // 題名だけでは足りない
  fireEvent.changeText(screen.getByLabelText("題名"), "ゲーム券");
  expect(submit.props.accessibilityState.disabled).toBe(true);

  // 題名＋Pt が揃うと押せるようになる
  fireEvent.changeText(screen.getByLabelText("Pt"), "80");
  expect(screen.getByLabelText("アイテムを追加").props.accessibilityState.disabled).toBe(false);
});

test("送信中は「追加」ボタンが無効化され、二重送信されない", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateStoreItem.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );

  render(<ParentStoreScreen />);
  openManageTab();
  fillValidForm();

  fireEvent.press(screen.getByLabelText("アイテムを追加"));
  fireEvent.press(screen.getByLabelText("アイテムを追加"));

  expect(mockCreateStoreItem).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByLabelText("アイテムを追加").props.accessibilityState.disabled).toBe(true),
  );

  resolveCreate({ id: "new-item" });
  await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
});

test("追加に失敗した場合は日本語の汎用エラーメッセージを表示する", async () => {
  mockCreateStoreItem.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));

  render(<ParentStoreScreen />);
  openManageTab();
  fillValidForm();
  fireEvent.press(screen.getByLabelText("アイテムを追加"));

  await waitFor(() => expect(screen.getByText("アイテムの追加に失敗しました")).toBeTruthy());
});

test("依頼人名を家族ユーザー一覧から解決して表示する", async () => {
  render(<ParentStoreScreen />);

  await waitFor(() => expect(mockFetchFamilyUsers).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText(/依頼人: テスト親/)).toBeTruthy());
});

test("家族ユーザー一覧の取得に失敗した場合はエラーメッセージを表示する", async () => {
  mockFetchFamilyUsers.mockRejectedValueOnce(new Error("network error"));

  render(<ParentStoreScreen />);

  await waitFor(() => expect(screen.getByText("依頼人の情報を取得できませんでした")).toBeTruthy());
  // 依頼人名は解決できず「不明」にフォールバックする
  expect(screen.getByText(/依頼人: 不明/)).toBeTruthy();
});
