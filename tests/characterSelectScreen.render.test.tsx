import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const mockStackScreen = jest.fn((_props: { options?: Record<string, unknown> }) => null);
jest.mock("expo-router", () => ({
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  router: { back: jest.fn(), push: jest.fn() },
}));

let mockCanUseRealData = true;
jest.mock("../store", () => ({
  // ふりがな（components/Furigana.tsx）を付けるかを、見ている人のロールで決めている
  useActiveRole: () => "child",
  useDataAccess: () => ({ canUseRealData: mockCanUseRealData }),
}));

const mockSelectCharacterType = jest.fn<(type: string) => Promise<void>>();
jest.mock("../lib/useCharacterAppearance", () => ({
  useCharacterAppearance: () => ({ isReady: true, select: mockSelectCharacterType }),
}));

let mockIsPaletteReady = true;
jest.mock("../lib/useCharacterPalette", () => ({
  useCharacterPalette: () => ({ isReady: mockIsPaletteReady }),
}));

jest.mock("../lib/useWardrobe", () => ({
  useWardrobe: () => ({ isReady: true }),
}));

jest.mock("../lib/audio", () => ({ playSoundEffect: jest.fn() }));

// プレビューは WebView の中で描くので、ここでは受け取った見た目だけを見る
type MockLook = { characterType: string; equipment: unknown; palette: unknown };
const mockPreviewLooks: MockLook[] = [];
jest.mock("../components/rpg-hub-web/WardrobePreview", () => ({
  getWardrobePreviewHeight: () => 300,
  WardrobePreview: (props: { look: MockLook }) => {
    mockPreviewLooks.push(props.look);
    return null;
  },
}));

import CharacterSelectScreen from "../components/CharacterSelectScreen";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { useAppearanceStore } from "../store/appearanceStore";
import { useWardrobeStore } from "../store/wardrobeStore";

const lastPreviewLook = () => mockPreviewLooks[mockPreviewLooks.length - 1];
const BLUE = "#4a90e2";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanUseRealData = true;
  mockIsPaletteReady = true;
  mockPreviewLooks.length = 0;
  mockSelectCharacterType.mockResolvedValue(undefined);
  useAppearanceStore.setState({ characterType: "frog", palette: {} });
  useWardrobeStore.setState({ equipment: {} });
});

// --- プレビュー（Issue #446） ---

test("今のキャラクターを、その人の色と装備でプレビューに映す", () => {
  useAppearanceStore.setState({ characterType: "cat", palette: { skin: BLUE } });
  useWardrobeStore.setState({ equipment: { head: RPG_HUB_ASSETS.wearableHat } });
  render(<CharacterSelectScreen />);

  expect(lastPreviewLook()).toMatchObject({
    characterType: "cat",
    equipment: { head: RPG_HUB_ASSETS.wearableHat },
    palette: { skin: BLUE },
  });
});

test("押したキャラクターを、保存の完了を待たずに元の色で映す", async () => {
  // 保存が終わらないままにして、押した直後の見え方を確かめる
  let finishSave: () => void = () => {};
  mockSelectCharacterType.mockReturnValue(new Promise<void>((resolve) => (finishSave = resolve)));
  useAppearanceStore.setState({ characterType: "frog", palette: { skin: BLUE } });
  render(<CharacterSelectScreen />);

  fireEvent.press(screen.getByRole("button", { name: "キャラクターをいぬにする" }));

  expect(mockSelectCharacterType).toHaveBeenCalledWith("dog");
  // 色は種類ごとに違うので、前の種類（かえる）の色は使わない
  expect(lastPreviewLook()).toMatchObject({ characterType: "dog", palette: {} });

  await act(async () => {
    finishSave();
  });
});

test("プレビューを右へドラッグしても戻らないよう、戻るスワイプは画面の左端からだけにする（Issue #388 と同じ）", () => {
  render(<CharacterSelectScreen />);

  const lastProps = mockStackScreen.mock.calls.at(-1)?.[0];
  expect(lastProps?.options).toEqual(expect.objectContaining({ fullScreenGestureEnabled: false }));
});

test("種類・色・装備の読み込みが終わるまでは、プレビューを映さない", () => {
  mockIsPaletteReady = false;
  render(<CharacterSelectScreen />);

  expect(mockPreviewLooks).toHaveLength(0);
});

test.each([true, false])(
  "色の案内から更衣室へ進め、キャラクターの種類は保存しない（実データ利用: %s）",
  (canUseRealData) => {
    mockCanUseRealData = canUseRealData;
    render(<CharacterSelectScreen />);

    fireEvent.press(screen.getByRole("link", { name: "きがえ（更衣室）で色を選ぶ" }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/wardrobe");
    expect(mockSelectCharacterType).not.toHaveBeenCalled();
    expect(useAppearanceStore.getState().characterType).toBe("frog");
  },
);
