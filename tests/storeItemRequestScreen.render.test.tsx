import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Alert } from "react-native";
import { getByFuriganaText, getInputByLabel } from "./furiganaQueries";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockReplace = jest.fn<(href: unknown) => void>();
// 送信中に離れさせないこと（usePreventRemove とスワイプの止め方）を確かめるため、最後に渡された内容を持っておく
let mockPreventRemove = false;
let mockPreventRemoveCallback: (() => void) | undefined;
const mockStackScreen = jest.fn<(props: { options?: Record<string, unknown> }) => null>(() => null);

jest.mock("expo-router", () => ({
  // 画面の import より先にこの factory が動くので、モックは呼ばれたときに参照する
  router: {
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
    replace: (href: unknown) => mockReplace(href),
  },
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  usePreventRemove: (preventRemove: boolean, callback: () => void) => {
    mockPreventRemove = preventRemove;
    mockPreventRemoveCallback = callback;
  },
}));

const mockRequestPermissions = jest.fn<(...args: unknown[]) => Promise<{ granted: boolean }>>();
const mockLaunchImageLibrary =
  jest.fn<
    (...args: unknown[]) => Promise<{ assets: { uri: string; fileSize?: number }[] | null; canceled: boolean }>
  >();

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
}));

const mockCreateStoreItemRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/storeItemRequestService", () => ({
  createStoreItemRequest: (...args: unknown[]) => mockCreateStoreItemRequest(...args),
}));

const mockUploadStoreItemImage = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockDeleteStoreItemImage = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.mock("../lib/storeImageUpload", () => {
  const actual = jest.requireActual<typeof import("../lib/storeImageUpload")>("../lib/storeImageUpload");
  return {
    MAX_STORE_ITEM_IMAGE_BYTES: actual.MAX_STORE_ITEM_IMAGE_BYTES,
    deleteStoreItemImage: (...args: unknown[]) => mockDeleteStoreItemImage(...args),
    uploadStoreItemImage: (...args: unknown[]) => mockUploadStoreItemImage(...args),
  };
});

import StoreItemRequestScreen from "../components/StoreItemRequestScreen";
import { useAppStore } from "../store";
import { pressWithoutWaiting } from "./pressWithoutWaiting";

// 実際のSupabaseユーザーはIDがuuid。書き込みが通る経路のテストはこちらを使う
const child = {
  family_id: "10000000-0000-4000-8000-000000000208",
  id: "22222222-2222-2222-2222-222222222222",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

const parent = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "はなこ",
  role: "parent" as const,
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
};

// 開発用クイックログイン（「子供として入る」）で入るモックID。uuidではない
const quickLoginChild = { ...child, id: "user-child-1" };

async function selectImage() {
  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/photo.jpg", fileSize: 1024 }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("商品画像を選択"));
  await waitFor(() => screen.getByLabelText("商品画像を選び直す"));
}

async function fillForm() {
  await fireEvent.changeText(getInputByLabel("商品名"), "夕飯リクエスト権2");
  await fireEvent.changeText(getInputByLabel("商品の詳細"), "夕飯を2回リクエストできる");
  await fireEvent.changeText(getInputByLabel("欲しい理由"), "お手伝いを頑張ったから");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  useAppStore.setState({ user: child });
  mockUploadStoreItemImage.mockResolvedValue(
    "https://example.supabase.co/storage/v1/object/public/store-item-images/fam/x.jpg",
  );
  mockDeleteStoreItemImage.mockResolvedValue(undefined);
});

test("未ログインの場合はログインを促す表示のみになる", async () => {
  useAppStore.setState({ user: null });
  await render(<StoreItemRequestScreen />);

  expect(screen.getByText("ログインしてください")).toBeTruthy();
  expect(screen.queryByLabelText("申請する")).toBeNull();
});

test("下の「戻る」ボタンで前の画面へ戻れる", async () => {
  await render(<StoreItemRequestScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockCreateStoreItemRequest).not.toHaveBeenCalled();
});

test("戻れる画面がないとき（Webでの再読み込みなど）は、下の「戻る」ボタンでストア画面へ移る", async () => {
  mockCanGoBack.mockReturnValue(false);
  await render(<StoreItemRequestScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(mockReplace).toHaveBeenCalledWith("/store-child");
  expect(mockBack).not.toHaveBeenCalled();
});

test("開発用クイックログイン（非UUIDのモックID）では申請できず、プレビュー中の表示になる", async () => {
  // isLive は true のままなので、uuidを見ないと書き込みが通ってしまい必ず失敗する（#174）
  useAppStore.setState({ user: quickLoginChild });
  await render(<StoreItemRequestScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  expect(getByFuriganaText("※ プレビュー中はボタンを操作できません")).toBeTruthy();
  expect(mockCreateStoreItemRequest).not.toHaveBeenCalled();
});

test("親ユーザーの場合は申請ボタンが無効化され、送信されない", async () => {
  useAppStore.setState({ user: parent });
  await render(<StoreItemRequestScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  expect(screen.getByText("※ 商品追加の申請は子供用アカウントのみ利用できます")).toBeTruthy();
  expect(mockCreateStoreItemRequest).not.toHaveBeenCalled();
});

test("未入力のまま送信するとエラーメッセージが表示され、送信されない", async () => {
  await render(<StoreItemRequestScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  expect(getByFuriganaText("商品画像を選択してください。")).toBeTruthy();
  expect(mockCreateStoreItemRequest).not.toHaveBeenCalled();
});

test("画像選択中に例外が発生した場合はエラーメッセージを表示する", async () => {
  mockRequestPermissions.mockRejectedValueOnce(new Error("権限確認に失敗しました"));
  await render(<StoreItemRequestScreen />);

  await fireEvent.press(screen.getByLabelText("商品画像を選択"));

  await waitFor(() => expect(screen.getByText("権限確認に失敗しました")).toBeTruthy());
});

test("画像を選択するとプレビューが表示される", async () => {
  await render(<StoreItemRequestScreen />);

  await selectImage();

  expect(screen.getByLabelText("商品画像を選び直す")).toBeTruthy();
});

test("上限を超える画像を選ぶとエラーメッセージが表示され、選択されない", async () => {
  await render(<StoreItemRequestScreen />);

  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/huge.jpg", fileSize: 8 * 1024 * 1024 + 1 }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("商品画像を選択"));

  await waitFor(() =>
    expect(
      getByFuriganaText("画像のサイズを確認できないか、上限（8MB）を超えています。別の画像を選んでください。"),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText("商品画像を選び直す")).toBeNull();
});

test("画像のサイズが取得できない場合もエラーメッセージが表示され、選択されない", async () => {
  await render(<StoreItemRequestScreen />);

  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/unknown-size.jpg" }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("商品画像を選択"));

  await waitFor(() =>
    expect(
      getByFuriganaText("画像のサイズを確認できないか、上限（8MB）を超えています。別の画像を選んでください。"),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText("商品画像を選び直す")).toBeNull();
});

test("必要項目を入力して送信すると申請が保存され、成功後にストア画面へ戻る", async () => {
  mockCreateStoreItemRequest.mockResolvedValueOnce({ id: "req-1" });
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.[0]?.onPress?.();
  });
  await render(<StoreItemRequestScreen />);

  await selectImage();
  await fillForm();
  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  await waitFor(() => expect(mockCreateStoreItemRequest).toHaveBeenCalledTimes(1));
  expect(mockUploadStoreItemImage).toHaveBeenCalledWith("file:///tmp/photo.jpg", child.family_id);
  expect(mockCreateStoreItemRequest).toHaveBeenCalledWith({
    description: "夕飯を2回リクエストできる",
    family_id: child.family_id,
    image_url: "https://example.supabase.co/storage/v1/object/public/store-item-images/fam/x.jpg",
    reason: "お手伝いを頑張ったから",
    requested_by: child.id,
    title: "夕飯リクエスト権2",
  });
  expect(alertSpy).toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("画像のアップロードに失敗した場合は申請を保存せず、エラーメッセージを表示する", async () => {
  mockUploadStoreItemImage.mockRejectedValueOnce(
    new Error("画像のアップロードに失敗しました。時間をおいて再度お試しください。"),
  );
  await render(<StoreItemRequestScreen />);

  await selectImage();
  await fillForm();
  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  await waitFor(() =>
    expect(screen.getByText("画像のアップロードに失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
  );
  expect(mockCreateStoreItemRequest).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  // アップロード自体が失敗しており、削除すべき画像がない
  expect(mockDeleteStoreItemImage).not.toHaveBeenCalled();
});

test("送信に失敗した場合はエラーメッセージを表示し、入力内容を保持する", async () => {
  mockCreateStoreItemRequest.mockRejectedValueOnce(new Error("商品追加の申請に失敗しました。時間をおいて再度お試しください。"));
  await render(<StoreItemRequestScreen />);

  await selectImage();
  await fillForm();
  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  await waitFor(() =>
    expect(screen.getByText("商品追加の申請に失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
  );
  expect(getInputByLabel("商品名").props.value).toBe("夕飯リクエスト権2");
  expect(mockBack).not.toHaveBeenCalled();
  // 申請の保存に失敗したので、アップロード済みの画像は後片付けで削除する
  expect(mockDeleteStoreItemImage).toHaveBeenCalledWith(
    "https://example.supabase.co/storage/v1/object/public/store-item-images/fam/x.jpg",
  );
});

test("送信中は二重送信できない", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateStoreItemRequest.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  await render(<StoreItemRequestScreen />);

  await selectImage();
  await fillForm();
  await pressWithoutWaiting(screen.getByRole("button", { name: "申請する" }));
  await pressWithoutWaiting(screen.getByRole("button", { name: "申請する" }));

  await waitFor(() => expect(mockCreateStoreItemRequest).toHaveBeenCalledTimes(1));
  resolveCreate({ id: "req-1" });
});

test("戻れる画面がないときは、送信成功の「OK」でストア画面へ移る", async () => {
  mockCanGoBack.mockReturnValue(false);
  mockCreateStoreItemRequest.mockResolvedValueOnce({ id: "req-1" });
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.[0]?.onPress?.();
  });
  await render(<StoreItemRequestScreen />);

  await selectImage();
  await fillForm();
  await fireEvent.press(screen.getByRole("button", { name: "申請する" }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/store-child"));
  expect(mockBack).not.toHaveBeenCalled();
});

test("送信中は下の「戻る」ボタンを押せない", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateStoreItemRequest.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<StoreItemRequestScreen />);

  await selectImage();
  await fillForm();
  await pressWithoutWaiting(screen.getByRole("button", { name: "申請する" }));
  await waitFor(() => expect(mockCreateStoreItemRequest).toHaveBeenCalledTimes(1));

  const backButton = screen.getByRole("button", { name: "前の画面に戻る" });
  expect(backButton.props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(backButton);
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();

  resolveCreate({ id: "req-1" });
});

test("送信中はスワイプやAndroidの戻る操作でも離れさせず、終わったら戻せる", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateStoreItemRequest.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<StoreItemRequestScreen />);

  expect(mockPreventRemove).toBe(false);
  expect(mockStackScreen).toHaveBeenLastCalledWith(
    expect.objectContaining({ options: expect.objectContaining({ gestureEnabled: true }) }),
  );

  await selectImage();
  await fillForm();
  await pressWithoutWaiting(screen.getByRole("button", { name: "申請する" }));
  await waitFor(() => expect(mockCreateStoreItemRequest).toHaveBeenCalledTimes(1));

  expect(mockPreventRemove).toBe(true);
  expect(mockStackScreen).toHaveBeenLastCalledWith(
    expect.objectContaining({ options: expect.objectContaining({ gestureEnabled: false }) }),
  );
  // 離れようとしたら、送信中だと知らせる
  mockPreventRemoveCallback?.();
  expect(alertSpy).toHaveBeenCalledWith("そうしんしています", "おわるまで まってね。");

  resolveCreate({ id: "req-1" });
  await waitFor(() => expect(mockPreventRemove).toBe(false));
});
