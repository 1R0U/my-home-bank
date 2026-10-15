import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { ComponentType } from "react";

const mockRedirect = jest.fn<(href: unknown) => void>();

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは描かない
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href);
    return null;
  },
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import ChildSettingsScreen from "../components/ChildSettingsScreen";
import ParentSettingsScreen from "../components/ParentSettingsScreen";
import { useAppStore } from "../store";

/** IDは非UUIDのまま。実データの取得を走らせずにロールだけ決める */
const loginAs = (role: "child" | "parent") =>
  useAppStore.setState({
    user: { balance: 0, created_at: "2026-07-01T00:00:00Z", id: `user-${role}-1`, name: "テスト", role },
  });

const renderLoaded = async (Screen: ComponentType) => {
  render(<Screen />);
  await act(async () => undefined);
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: null });
});

// 設定画面はロールを固定して読み書きするので、反対のロールがURLで直接開いたら
// その人の画面へ移す（Issue #439）
describe("設定画面を反対のロールが開いたとき", () => {
  test("子供が大人用を開くと、子供用へ移す", async () => {
    loginAs("child");
    await renderLoaded(ParentSettingsScreen);

    expect(mockRedirect).toHaveBeenCalledWith("/settings-child");
    expect(screen.queryByLabelText("立場 おとな")).toBeNull();
  });

  test("大人が子供用を開くと、大人用へ移す", async () => {
    loginAs("parent");
    await renderLoaded(ChildSettingsScreen);

    expect(mockRedirect).toHaveBeenCalledWith("/settings-adult");
    expect(screen.queryByLabelText("立場 こども")).toBeNull();
  });

  test("子供が子供用を開いたら移さない", async () => {
    loginAs("child");
    await renderLoaded(ChildSettingsScreen);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("大人が大人用を開いたら移さない", async () => {
    loginAs("parent");
    await renderLoaded(ParentSettingsScreen);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("ロールが未確定の間は移さない", async () => {
    await renderLoaded(ChildSettingsScreen);
    await renderLoaded(ParentSettingsScreen);

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
