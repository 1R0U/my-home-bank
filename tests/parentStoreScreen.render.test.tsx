import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";
import type { StoreItem, StoreItemRequest } from "../types";
import TutorialHarness from "./helpers/TutorialHarness";

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

const mockUploadStoreItemImage = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockDeleteStoreItemImage = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock("../lib/storeImageUpload", () => {
  const actual = jest.requireActual<typeof import("../lib/storeImageUpload")>("../lib/storeImageUpload");
  return {
    isLocalFileUri: actual.isLocalFileUri,
    MAX_STORE_ITEM_IMAGE_BYTES: actual.MAX_STORE_ITEM_IMAGE_BYTES,
    deleteStoreItemImage: (...args: unknown[]) => mockDeleteStoreItemImage(...args),
    uploadStoreItemImage: (...args: unknown[]) => mockUploadStoreItemImage(...args),
  };
});

const mockRequestPermissions = jest.fn<(...args: unknown[]) => Promise<{ granted: boolean }>>();
const mockLaunchImageLibrary =
  jest.fn<
    (...args: unknown[]) => Promise<{ assets: { uri: string; fileSize?: number }[] | null; canceled: boolean }>
  >();
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
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
import { pressWithoutWaiting } from "./pressWithoutWaiting";

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
  mockUploadStoreItemImage.mockResolvedValue(
    "https://example.supabase.co/storage/v1/object/public/store-item-images/family-1/x.jpg",
  );
  mockDeleteStoreItemImage.mockResolvedValue(undefined);
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

async function openManageTab() {
  await fireEvent.press(screen.getByRole("button", { name: "アイテム管理" }));
}

async function openRequestsTab() {
  await fireEvent.press(screen.getByRole("button", { name: /申請/ }));
}

async function fillValidForm() {
  await fireEvent.changeText(screen.getByLabelText("題名"), "ゲーム1時間延長券");
  await fireEvent.changeText(screen.getByLabelText("gol"), "80");
}

test("着せ替えと装飾は自動陳列と案内し、親の登録フォームは通常商品だけを追加する", async () => {
  await render(<ParentStoreScreen />);
  await openManageTab();
  expect(screen.getByText(/着せ替え品・装飾品は全種類が自動で並びます/)).toBeTruthy();
  expect(screen.queryByLabelText("着せ替え：ぼうし")).toBeNull();
  await fillValidForm();
  await fireEvent.press(screen.getByLabelText("アイテムを追加"));
  await waitFor(() => expect(mockCreateStoreItem).toHaveBeenCalledTimes(1));
  const input = mockCreateStoreItem.mock.calls[0][0] as Record<string, unknown>;
  expect(input).toMatchObject({ title: "ゲーム1時間延長券", price: 80 });
  expect(input).not.toHaveProperty("asset_id");
  expect(input).not.toHaveProperty("is_system_asset");
  await waitFor(() => expect(mockReload).toHaveBeenCalled());
});

test("自動商品は親の依頼品として表示しない", async () => {
  mockStoreItemsResult.items = [{ ...item, title: "キャップ", asset_id: "wearable-cap", is_system_asset: true, requested_by: null }];
  await render(<ParentStoreScreen />);
  expect(screen.getByLabelText(/キャップ.*おうちギルドの商品/)).toBeTruthy();
  expect(screen.getByText(/おうちギルドの商品 ・ 在庫/)).toBeTruthy();
  await waitFor(() => expect(mockFetchFamilyUsers).toHaveBeenCalled());
});

test("開発用クイックログイン（非UUIDのモックID）では入力が揃っていても「追加」ボタンが無効化される", async () => {
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

  await render(<ParentStoreScreen />);
  await openManageTab();
  await fillValidForm();

  const submit = screen.getByLabelText("アイテムを追加");
  expect(submit.props.accessibilityState.disabled).toBe(true);

  await fireEvent.press(submit);
  expect(mockCreateStoreItem).not.toHaveBeenCalled();
});

test("入力が不十分な間は「追加」ボタンが無効化される", async () => {
  await render(<ParentStoreScreen />);
  await openManageTab();

  const submit = screen.getByLabelText("アイテムを追加");
  expect(submit.props.accessibilityState.disabled).toBe(true);

  // 題名だけでは足りない
  await fireEvent.changeText(screen.getByLabelText("題名"), "ゲーム券");
  expect(submit.props.accessibilityState.disabled).toBe(true);

  // 題名＋gol が揃うと押せるようになる
  await fireEvent.changeText(screen.getByLabelText("gol"), "80");
  expect(screen.getByLabelText("アイテムを追加").props.accessibilityState.disabled).toBe(false);
});

test("送信中は「追加」ボタンが無効化され、二重送信されない", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateStoreItem.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );

  await render(<ParentStoreScreen />);
  await openManageTab();
  await fillValidForm();

  await pressWithoutWaiting(screen.getByLabelText("アイテムを追加"));
  await pressWithoutWaiting(screen.getByLabelText("アイテムを追加"));

  expect(mockCreateStoreItem).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(screen.getByLabelText("アイテムを追加").props.accessibilityState.disabled).toBe(true),
  );

  resolveCreate({ id: "new-item" });
  await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
});

test("追加に失敗した場合は日本語の汎用エラーメッセージを表示する", async () => {
  mockCreateStoreItem.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));

  await render(<ParentStoreScreen />);
  await openManageTab();
  await fillValidForm();
  await fireEvent.press(screen.getByLabelText("アイテムを追加"));

  await waitFor(() => expect(screen.getByText("アイテムの追加に失敗しました")).toBeTruthy());
});

async function pickImage() {
  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/item-photo.jpg", fileSize: 1024 }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("画像を追加"));
  await waitFor(() => screen.getByLabelText("画像を選び直す"));
}

test("画像を選んで追加すると、アップロード後の公開URLで商品が作られる", async () => {
  await render(<ParentStoreScreen />);
  await openManageTab();
  await pickImage();
  await fillValidForm();
  await fireEvent.press(screen.getByLabelText("アイテムを追加"));

  await waitFor(() => expect(mockCreateStoreItem).toHaveBeenCalledTimes(1));
  expect(mockUploadStoreItemImage).toHaveBeenCalledWith("file:///tmp/item-photo.jpg", "family-1");
  expect(mockCreateStoreItem).toHaveBeenCalledWith(
    expect.objectContaining({
      image_url: "https://example.supabase.co/storage/v1/object/public/store-item-images/family-1/x.jpg",
    }),
  );
});

test("画像のアップロードに失敗した場合はアイテムを追加せず、エラーメッセージを表示する", async () => {
  mockUploadStoreItemImage.mockRejectedValueOnce(
    new Error("画像のアップロードに失敗しました。時間をおいて再度お試しください。"),
  );
  await render(<ParentStoreScreen />);
  await openManageTab();
  await pickImage();
  await fillValidForm();
  await fireEvent.press(screen.getByLabelText("アイテムを追加"));

  await waitFor(() =>
    expect(screen.getByText("画像のアップロードに失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
  );
  expect(mockCreateStoreItem).not.toHaveBeenCalled();
  // アップロード自体が失敗しており、削除すべき画像がない
  expect(mockDeleteStoreItemImage).not.toHaveBeenCalled();
});

test("画像を選んで追加した後にDB保存が失敗した場合は、アップロード済みの画像を削除する", async () => {
  mockCreateStoreItem.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));
  await render(<ParentStoreScreen />);
  await openManageTab();
  await pickImage();
  await fillValidForm();
  await fireEvent.press(screen.getByLabelText("アイテムを追加"));

  await waitFor(() => expect(screen.getByText("アイテムの追加に失敗しました")).toBeTruthy());
  expect(mockDeleteStoreItemImage).toHaveBeenCalledWith(
    "https://example.supabase.co/storage/v1/object/public/store-item-images/family-1/x.jpg",
  );
});

test("上限を超える画像を選ぶとエラーメッセージが表示され、選択されない", async () => {
  await render(<ParentStoreScreen />);
  await openManageTab();

  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/huge.jpg", fileSize: 8 * 1024 * 1024 + 1 }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("画像を追加"));

  await waitFor(() =>
    expect(
      screen.getByText("画像のサイズを確認できないか、上限（8MB）を超えています。別の画像を選んでください。"),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText("画像を選び直す")).toBeNull();
});

test("画像のサイズが取得できない場合もエラーメッセージが表示され、選択されない", async () => {
  await render(<ParentStoreScreen />);
  await openManageTab();

  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/unknown-size.jpg" }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("画像を追加"));

  await waitFor(() =>
    expect(
      screen.getByText("画像のサイズを確認できないか、上限（8MB）を超えています。別の画像を選んでください。"),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText("画像を選び直す")).toBeNull();
});

test("画像を選ばなくてもアイテムを追加できる（任意項目）", async () => {
  await render(<ParentStoreScreen />);
  await openManageTab();
  await fillValidForm();
  await fireEvent.press(screen.getByLabelText("アイテムを追加"));

  await waitFor(() => expect(mockCreateStoreItem).toHaveBeenCalledTimes(1));
  expect(mockUploadStoreItemImage).not.toHaveBeenCalled();
  expect(mockCreateStoreItem).toHaveBeenCalledWith(expect.objectContaining({ image_url: undefined }));
});

test("取得中（初回）は「アイテムがありません」を表示しない", async () => {
  mockStoreItemsResult = {
    items: [],
    loading: true,
    error: null,
    isLive: true,
    reload: mockReload,
  };

  await render(<ParentStoreScreen />);

  expect(screen.queryByText("アイテムがありません")).toBeNull();
});

test("取得が完了して0件だった場合は「アイテムがありません」を表示する", async () => {
  mockStoreItemsResult = {
    items: [],
    loading: false,
    error: null,
    isLive: true,
    reload: mockReload,
  };

  await render(<ParentStoreScreen />);

  expect(screen.getByText("アイテムがありません")).toBeTruthy();
});

test("依頼人名を家族ユーザー一覧から解決して表示する", async () => {
  await render(<ParentStoreScreen />);

  await waitFor(() => expect(mockFetchFamilyUsers).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText(/依頼人: テスト親/)).toBeTruthy());
});

test("家族ユーザー一覧の取得に失敗した場合はエラーメッセージを表示する", async () => {
  mockFetchFamilyUsers.mockRejectedValueOnce(new Error("network error"));

  await render(<ParentStoreScreen />);

  await waitFor(() => expect(screen.getByText("依頼人の情報を取得できませんでした")).toBeTruthy());
  // 依頼人名は解決できず「不明」にフォールバックする
  expect(screen.getByText(/依頼人: 不明/)).toBeTruthy();
});

test("取得中（初回）は「承認待ちの申請はありません」を表示しない", async () => {
  mockStoreItemRequestsResult = {
    requests: [],
    loading: true,
    error: null,
    isLive: true,
    reload: mockReloadRequests,
  };

  await render(<ParentStoreScreen />);
  await openRequestsTab();

  expect(screen.queryByText("承認待ちの申請はありません")).toBeNull();
});

test("開発用クイックログイン（非UUIDのモックID）では申請タブの許可・拒否ボタンが無効化される", async () => {
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

  await render(<ParentStoreScreen />);
  await openRequestsTab();
  await fireEvent.press(screen.getByRole("button", { name: /テスト申請/ }));
  await fireEvent.changeText(screen.getByLabelText("gol"), "80");

  expect(screen.getByRole("button", { name: "許可" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "拒否" }).props.accessibilityState.disabled).toBe(true);
});

test("別の申請へ直接切り替えると、入力中のゴル数が前の申請の値を引き継がない", async () => {
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

  await render(<ParentStoreScreen />);
  await openRequestsTab();

  await fireEvent.press(screen.getByRole("button", { name: /テスト申請/ }));
  await fireEvent.changeText(screen.getByLabelText("gol"), "80");

  // 「閉じる」を経由せず、一覧の別の行を直接タップして別の申請へ切り替える
  await fireEvent.press(screen.getByRole("button", { name: /別の申請/ }));

  expect(screen.getByLabelText("gol").props.value).toBe("");
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
  const { rerender } = await render(<ParentStoreScreen />);

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
  await rerender(<ParentStoreScreen />);

  expect(resolvers).toHaveLength(2);

  // Bの結果を先に、Aの結果を後に解決する（順序が逆転したケース）
  await act(async () => {
    resolvers[1]([{ id: "child-x", name: "ビー家の子" }]);
  });
  await act(async () => {
    resolvers[0]([{ id: "child-x", name: "エー家の子" }]);
  });

  await openRequestsTab();

  expect(screen.getByText("申請者: ビー家の子")).toBeTruthy();
  expect(screen.queryByText("申請者: エー家の子")).toBeNull();
});

test("大人の案内は商品一覧・追加・申請を開き、追加や承認を求めない", async () => {
  await render(<TutorialHarness initialStep="parent-store-list"><ParentStoreScreen /></TutorialHarness>);
  await act(async () => undefined);
  await fireEvent.press(screen.getByRole("button", { name: "アイテム一覧" }));
  expect(screen.getByTestId("tutorial-frame-parent-store-manage")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "アイテム管理" }));
  expect(screen.getByTestId("tutorial-frame-parent-store-requests")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /^申請/ }));
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-store-summary");
  expect(mockCreateStoreItem).not.toHaveBeenCalled();
  expect(mockUploadStoreItemImage).not.toHaveBeenCalled();
});
