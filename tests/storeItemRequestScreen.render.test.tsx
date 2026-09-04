import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Alert } from "react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

const mockRequestPermissions = jest.fn<(...args: unknown[]) => Promise<{ granted: boolean }>>();
const mockLaunchImageLibrary =
  jest.fn<(...args: unknown[]) => Promise<{ assets: { uri: string }[] | null; canceled: boolean }>>();

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
}));

const mockCreateStoreItemRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/storeItemRequestService", () => ({
  createStoreItemRequest: (...args: unknown[]) => mockCreateStoreItemRequest(...args),
}));

import StoreItemRequestScreen from "../components/StoreItemRequestScreen";
import { useAppStore } from "../store";

const child = {
  id: "user-child-1",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

async function selectImage() {
  mockRequestPermissions.mockResolvedValueOnce({ granted: true });
  mockLaunchImageLibrary.mockResolvedValueOnce({
    assets: [{ uri: "file:///tmp/photo.jpg" }],
    canceled: false,
  });
  await fireEvent.press(screen.getByLabelText("商品画像を選択"));
  await waitFor(() => screen.getByLabelText("商品画像を選び直す"));
}

function fillForm() {
  fireEvent.changeText(screen.getByLabelText("商品名"), "夕飯リクエスト権2");
  fireEvent.changeText(screen.getByLabelText("商品の詳細"), "夕飯を2回リクエストできる");
  fireEvent.changeText(screen.getByLabelText("欲しい理由"), "お手伝いを頑張ったから");
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
});

test("未ログインの場合はログインを促す表示のみになる", () => {
  useAppStore.setState({ user: null });
  render(<StoreItemRequestScreen />);

  expect(screen.getByText("ログインしてください")).toBeTruthy();
  expect(screen.queryByLabelText("申請する")).toBeNull();
});

test("未入力のまま送信するとエラーメッセージが表示され、送信されない", () => {
  render(<StoreItemRequestScreen />);

  fireEvent.press(screen.getByLabelText("申請する"));

  expect(screen.getByText("商品画像を選択してください。")).toBeTruthy();
  expect(mockCreateStoreItemRequest).not.toHaveBeenCalled();
});

test("画像を選択するとプレビューが表示される", async () => {
  render(<StoreItemRequestScreen />);

  await selectImage();

  expect(screen.getByLabelText("商品画像を選び直す")).toBeTruthy();
});

test("必要項目を入力して送信すると申請が保存され、成功後にストア画面へ戻る", async () => {
  mockCreateStoreItemRequest.mockResolvedValueOnce({ id: "req-1" });
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.[0]?.onPress?.();
  });
  render(<StoreItemRequestScreen />);

  await selectImage();
  fillForm();
  fireEvent.press(screen.getByLabelText("申請する"));

  await waitFor(() => expect(mockCreateStoreItemRequest).toHaveBeenCalledTimes(1));
  expect(mockCreateStoreItemRequest).toHaveBeenCalledWith({
    description: "夕飯を2回リクエストできる",
    image_url: "file:///tmp/photo.jpg",
    reason: "お手伝いを頑張ったから",
    requested_by: "user-child-1",
    title: "夕飯リクエスト権2",
  });
  expect(alertSpy).toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("送信に失敗した場合はエラーメッセージを表示し、入力内容を保持する", async () => {
  mockCreateStoreItemRequest.mockRejectedValueOnce(new Error("商品追加の申請に失敗しました。時間をおいて再度お試しください。"));
  render(<StoreItemRequestScreen />);

  await selectImage();
  fillForm();
  fireEvent.press(screen.getByLabelText("申請する"));

  await waitFor(() =>
    expect(screen.getByText("商品追加の申請に失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
  );
  expect(screen.getByLabelText("商品名").props.value).toBe("夕飯リクエスト権2");
  expect(mockBack).not.toHaveBeenCalled();
});

test("送信中は二重送信できない", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateStoreItemRequest.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  render(<StoreItemRequestScreen />);

  await selectImage();
  fillForm();
  fireEvent.press(screen.getByLabelText("申請する"));
  fireEvent.press(screen.getByLabelText("申請する"));

  expect(mockCreateStoreItemRequest).toHaveBeenCalledTimes(1);
  resolveCreate({ id: "req-1" });
});
