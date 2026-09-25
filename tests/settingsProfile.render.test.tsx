import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
}));

const mockFetchUserSettings = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateUserSettings = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: (...args: unknown[]) => mockFetchUserSettings(...args),
  updateUserSettings: (...args: unknown[]) => mockUpdateUserSettings(...args),
}));

import SettingsScreen from "../components/SettingsScreen";
import { createInitialSettingsByRole } from "../lib/settings";
import { useAppStore } from "../store";

const child = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id: "11111111-1111-4111-8111-111111111111",
  name: "たろう",
  role: "child" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ settings: createInitialSettingsByRole("お父さん", "たろう"), user: child });
  mockFetchUserSettings.mockResolvedValue({
    birthDate: "2015-04-12",
    gender: "male",
    name: "たろう",
    notificationsEnabled: true,
  });
  mockUpdateUserSettings.mockResolvedValue(undefined);
});

/** 設定画面を開き、保存済みの設定を読み込み終えるまで待つ。 */
const renderLoaded = async () => {
  render(<SettingsScreen />);
  await act(async () => undefined);
};

test("保存済みの生年月日と性別を表示する（固定値ではない／Issue #277）", async () => {
  await renderLoaded();

  expect(screen.getByLabelText("生年月日").props.value).toBe("2015/04/12");
  expect(screen.getByLabelText("性別 男性").props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText("性別 女性").props.accessibilityState.checked).toBe(false);
});

test("変えていなければ保存できない", async () => {
  await renderLoaded();

  expect(screen.getByLabelText("生年月日と性別を保存").props.accessibilityState.disabled).toBe(true);
});

test("生年月日と性別を変えて保存すると、本人の設定として保存する", async () => {
  await renderLoaded();

  fireEvent.changeText(screen.getByLabelText("生年月日"), "2015/4/13");
  fireEvent.press(screen.getByLabelText("性別 女性"));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("生年月日と性別を保存"));
  });

  expect(mockUpdateUserSettings).toHaveBeenCalledWith(child.id, { birthDate: "2015-04-13", gender: "female" });
  expect(useAppStore.getState().settings.child.birthDate).toBe("2015-04-13");
  expect(useAppStore.getState().settings.child.gender).toBe("female");
  // 保存後は入力欄も保存した値の書き方にそろう
  expect(screen.getByLabelText("生年月日").props.value).toBe("2015/04/13");
});

test("空欄と「未設定」で、未設定に戻して保存できる", async () => {
  await renderLoaded();

  fireEvent.changeText(screen.getByLabelText("生年月日"), "");
  fireEvent.press(screen.getByLabelText("性別 未設定"));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("生年月日と性別を保存"));
  });

  expect(mockUpdateUserSettings).toHaveBeenCalledWith(child.id, { birthDate: null, gender: null });
});

test("誤った生年月日は理由を出し、保存できない", async () => {
  await renderLoaded();

  fireEvent.changeText(screen.getByLabelText("生年月日"), "2015/02/30");

  expect(screen.getByText("存在しない日付です")).toBeTruthy();
  expect(screen.getByLabelText("生年月日と性別を保存").props.accessibilityState.disabled).toBe(true);
});

test("保存に失敗したら、画面の保存済みの値は変えずに理由を出す", async () => {
  mockUpdateUserSettings.mockRejectedValue(new Error("通信に失敗しました"));
  await renderLoaded();

  fireEvent.press(screen.getByLabelText("性別 女性"));
  await act(async () => {
    fireEvent.press(screen.getByLabelText("生年月日と性別を保存"));
  });

  expect(screen.getByText("通信に失敗しました")).toBeTruthy();
  expect(useAppStore.getState().settings.child.gender).toBe("male");
});
