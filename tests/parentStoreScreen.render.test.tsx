import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { StoreItem, StoreItemRequest } from "../types";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
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

const mockReloadRequests = jest.fn();
type UseStoreItemRequestsResult = {
  requests: StoreItemRequest[];
  loading: boolean;
  error: string | null;
  isLive: boolean;
  reload: () => void;
};
let mockStoreItemRequestsResult: UseStoreItemRequestsResult;
jest.mock("../lib/useStoreItemRequests", () => ({
  useStoreItemRequests: () => mockStoreItemRequestsResult,
}));

import ParentStoreScreen from "../components/ParentStoreScreen";

const item: StoreItem = {
  family_id: "family-1",
  id: "item-1",
  title: "夕飯リクエスト権",
  description: "その日の夜ご飯のメニューをリクエストできる",
  image_url: null,
  price: 100,
  stock: 999999,
  requested_by: "user-parent-1",
  is_active: true,
  created_at: "2026-07-01T00:00:00Z",
};

const pendingRequest: StoreItemRequest = {
  id: "req-1",
  family_id: "family-1",
  requested_by: "child-x",
  title: "テスト申請",
  description: "説明",
  reason: "理由",
  image_url: "",
  status: "pending",
  created_at: "2026-09-10T00:00:00Z",
  approved_by: null,
  approved_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    user: {
      family_id: "family-1",
      id: "11111111-1111-1111-1111-111111111111",
      name: "お父さん",
      role: "parent",
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
    },
  });
  mockStoreItemsResult = {
    items: [item],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  };
  mockStoreItemRequestsResult = {
    requests: [],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReloadRequests,
  };
});

function openManageTab() {
  fireEvent.press(screen.getByRole("button", { name: "アイテム管理" }));
}

function openRequestsTab() {
  fireEvent.press(screen.getByRole("button", { name: /申請/ }));
}

function fillValidForm() {
  fireEvent.changeText(screen.getByLabelText("題名"), "ゲーム1時間延長券");
  fireEvent.changeText(screen.getByLabelText("Pt"), "80");
}

test("開発用クイックログイン（非UUIDのモックID）では入力が揃っていても「追加」ボタンが無効化される", () => {
  // store_items.requested_by は uuid型 + users(id) への外部キー。モックIDで
  // insert すると 22P02 invalid input syntax for type uuid で失敗するため、
  // canUseRealData（子供側の購入と同じ判定）でボタン自体を無効化する（#174）。
  useAppStore.setState({
    user: {
      id: "user-parent-1",
      name: "お父さん",
      role: "parent",
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
    },
  });

  render(<ParentStoreScreen />);
  openManageTab();
  fillValidForm();

  const submit = screen.getByLabelText("アイテムを追加");
  expect(submit.props.accessibilityState.disabled).toBe(true);

  fireEvent.press(submit);
  expect(mockCreateStoreItem).not.toHaveBeenCalled();
});

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

test("取得中（初回）は「アイテムがありません」を表示しない", () => {
  mockStoreItemsResult = {
    items: [],
    loading: true,
    error: null,
    isLive: true,
    reload: mockReload,
  };

  render(<ParentStoreScreen />);

  expect(screen.queryByText("アイテムがありません")).toBeNull();
});

test("取得が完了して0件だった場合は「アイテムがありません」を表示する", () => {
  mockStoreItemsResult = {
    items: [],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  };

  render(<ParentStoreScreen />);

  expect(screen.getByText("アイテムがありません")).toBeTruthy();
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

test("取得中（初回）は「承認待ちの申請はありません」を表示しない", () => {
  mockStoreItemRequestsResult = {
    requests: [],
    loading: true,
    error: null,
    isLive: true,
    reload: mockReloadRequests,
  };

  render(<ParentStoreScreen />);
  openRequestsTab();

  expect(screen.queryByText("承認待ちの申請はありません")).toBeNull();
});

test("開発用クイックログイン（非UUIDのモックID）では申請タブの許可・拒否ボタンが無効化される", () => {
  // approve_store_item_request / reject_store_item_request は p_approver_id が uuid型。
  // モックIDで呼ぶと invalid input syntax for type uuid で失敗するため、
  // アイテム管理タブの「追加」ボタンと同じ canUseRealData で無効化する。
  useAppStore.setState({
    user: {
      id: "user-parent-1",
      name: "お父さん",
      role: "parent",
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
    },
  });
  mockStoreItemRequestsResult = {
    requests: [pendingRequest],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReloadRequests,
  };

  render(<ParentStoreScreen />);
  openRequestsTab();
  fireEvent.press(screen.getByRole("button", { name: /テスト申請/ }));
  fireEvent.changeText(screen.getByLabelText("ポイント数"), "80");

  expect(screen.getByRole("button", { name: "許可" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "拒否" }).props.accessibilityState.disabled).toBe(true);
});

test("別の申請へ直接切り替えると、入力中のポイント数が前の申請の値を引き継がない", () => {
  const secondRequest: StoreItemRequest = {
    ...pendingRequest,
    id: "req-2",
    title: "別の申請",
  };
  mockStoreItemRequestsResult = {
    requests: [pendingRequest, secondRequest],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReloadRequests,
  };

  render(<ParentStoreScreen />);
  openRequestsTab();

  fireEvent.press(screen.getByRole("button", { name: /テスト申請/ }));
  fireEvent.changeText(screen.getByLabelText("ポイント数"), "80");

  // 「閉じる」を経由せず、一覧の別の行を直接タップして別の申請へ切り替える
  fireEvent.press(screen.getByRole("button", { name: /別の申請/ }));

  expect(screen.getByLabelText("ポイント数").props.value).toBe("");
});

test("ユーザー切り替え時、先に開始した家族一覧取得が後から完了しても新しい一覧を上書きしない", async () => {
  // 申請タブに申請者名を表示させるため、承認待ちの申請を1件用意する
  mockStoreItemRequestsResult = {
    requests: [pendingRequest],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReloadRequests,
  };

  // 取得を任意のタイミングで解決できるようにする
  const resolvers: ((users: { id: string; name: string }[]) => void)[] = [];
  mockFetchFamilyUsers.mockImplementation(
    () => new Promise((resolve) => resolvers.push(resolve)),
  );

  useAppStore.setState({
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      family_id: "family-a",
      name: "親A",
      role: "parent",
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
    },
  });
  const { rerender } = render(<ParentStoreScreen />);

  // 親A→親Bへ切り替え（どちらも isLive、別の家族）
  useAppStore.setState({
    user: {
      id: "22222222-2222-2222-2222-222222222222",
      family_id: "family-b",
      name: "親B",
      role: "parent",
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
    },
  });
  rerender(<ParentStoreScreen />);

  expect(resolvers).toHaveLength(2);

  // Bの結果を先に、Aの結果を後に解決する（順序が逆転したケース）
  await act(async () => {
    resolvers[1]([{ id: "child-x", name: "ビー家の子" }]);
  });
  await act(async () => {
    resolvers[0]([{ id: "child-x", name: "エー家の子" }]);
  });

  openRequestsTab();

  expect(screen.getByText("申請者: ビー家の子")).toBeTruthy();
  expect(screen.queryByText("申請者: エー家の子")).toBeNull();
});
