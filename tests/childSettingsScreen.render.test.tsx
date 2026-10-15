import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn<() => boolean>();

// アイコンのキャラクター（Issue #306）は3Dを描く WebView を使うので、この画面のテストでは
// 描かない。アイコン自体は tests/characterAvatar.render.test.tsx で確かめる
jest.mock("../components/CharacterAvatar", () => ({ __esModule: true, default: () => null }));
jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));
jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  Stack: { Screen: () => null },
}));
// 設定サービスが誤って実クライアントへ接続してもテストを外部環境に依存させない。
jest.mock("../lib/settingsService", () => ({
  fetchUserSettings: jest.fn(() => Promise.resolve({})),
  updateUserSettings: jest.fn(() => Promise.resolve()),
}));

import ChildSettingsScreen from "../components/ChildSettingsScreen";

const renderLoaded = async () => {
  render(<ChildSettingsScreen />);
  await act(async () => undefined);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe("子供用の設定画面（Issue #439）", () => {
  test("立場は「こども」と表示する", async () => {
    await renderLoaded();

    expect(screen.getByLabelText("立場 こども")).toBeTruthy();
  });

  test("家族の子供の管理（大人だけの項目）は出さない", async () => {
    await renderLoaded();

    expect(screen.queryByRole("button", { name: "家族の子供" })).toBeNull();
  });

  test("戻るボタンで前の画面に戻る", async () => {
    await renderLoaded();

    fireEvent.press(screen.getByLabelText("前の画面に戻る"));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("戻る先が無いとき（Webで直接開いたなど）はホームへ移る", async () => {
    mockCanGoBack.mockReturnValue(false);
    await renderLoaded();

    fireEvent.press(screen.getByLabelText("前の画面に戻る"));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
