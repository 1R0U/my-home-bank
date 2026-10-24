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
let mockUserId = "user-1";
jest.mock("../store", () => ({
  // ふりがな（components/Furigana.tsx）を付けるかを、見ている人のロールで決めている
  useActiveRole: () => "child",
  useCurrentUser: () => ({ id: mockUserId }),
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
let mockOnPortraitRendered: ((key: string, dataUrl: string) => void) | undefined;
jest.mock("../components/rpg-hub-web/WardrobePreview", () => ({
  getWardrobePreviewHeight: () => 300,
  WardrobePreview: (props: { look: MockLook; onPortraitRendered?: (key: string, dataUrl: string) => void }) => {
    mockPreviewLooks.push(props.look);
    mockOnPortraitRendered = props.onPortraitRendered;
    return null;
  },
}));

import CharacterSelectScreen from "../components/CharacterSelectScreen";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { useAppearanceStore } from "../store/appearanceStore";
import { useWardrobeStore } from "../store/wardrobeStore";
import { usePortraitStore } from "../store/portraitStore";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";

const lastPreviewLook = () => mockPreviewLooks[mockPreviewLooks.length - 1];
const BLUE = "#4a90e2";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanUseRealData = true;
  mockIsPaletteReady = true;
  mockUserId = "user-1";
  mockPreviewLooks.length = 0;
  mockOnPortraitRendered = undefined;
  usePortraitStore.setState({ images: {} });
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

test("選び直した姿の画像を、移動中にも使えるように残す", () => {
  useAppearanceStore.setState({ characterType: "cat", palette: { skin: BLUE } });
  render(<CharacterSelectScreen />);
  const key = getPortraitKey(lastPreviewLook() as PortraitLook);
  const image = "data:image/png;base64,iVBORw0KGgo=";

  expect(mockOnPortraitRendered).toBeDefined();
  act(() => { mockOnPortraitRendered?.(key, image); });

  expect(usePortraitStore.getState().images[key]).toBe(image);
});

const RED = "#e74c3c";
const typeButton = (label: string) => screen.getByRole("button", { name: `キャラクターを${label}にする` });

test("押したボタンは保存の完了を待たずに選択中になり、プレビューは読み込みが終わるまで前の姿のまま", async () => {
  // 保存が終わらないままにして、押した直後の見え方を確かめる
  let finishSave: () => void = () => {};
  mockSelectCharacterType.mockReturnValue(new Promise<void>((resolve) => (finishSave = resolve)));
  useAppearanceStore.setState({ characterType: "frog", palette: { skin: BLUE } });
  render(<CharacterSelectScreen />);

  fireEvent.press(typeButton("いぬ"));

  expect(mockSelectCharacterType).toHaveBeenCalledWith("dog");
  // ボタンとプレビューで選択中の種類が食い違わないよう、ボタンは押した種類を選択中にする
  expect(typeButton("いぬ").props.accessibilityState).toMatchObject({ selected: true });
  expect(typeButton("かえる").props.accessibilityState).toMatchObject({ selected: false });
  // プレビューは、いぬの色を読み込むまで前の姿（かえる・自分の色）のまま
  expect(lastPreviewLook()).toMatchObject({ characterType: "frog", palette: { skin: BLUE } });

  await act(async () => {
    finishSave();
  });
});

test("新しい種類の色を読み込んでから、1回で自分の色の姿に切り替える", async () => {
  useAppearanceStore.setState({ characterType: "frog", palette: { skin: BLUE } });
  // 保存が終わると種類が変わり、その種類の色を読み込み中になる
  mockSelectCharacterType.mockImplementation(async (type) => {
    mockIsPaletteReady = false;
    useAppearanceStore.setState({ characterType: type as "dog", palette: {} });
  });
  const { rerender } = render(<CharacterSelectScreen />);

  await act(async () => {
    fireEvent.press(typeButton("いぬ"));
  });
  // 色の読み込みが終わる
  mockIsPaletteReady = true;
  act(() => {
    useAppearanceStore.setState({ palette: { skin: RED } });
  });
  rerender(<CharacterSelectScreen />);

  expect(lastPreviewLook()).toMatchObject({ characterType: "dog", palette: { skin: RED } });
  // 元の色のいぬを挟まない（ちらつかない）
  const dogLooks = mockPreviewLooks.filter((look) => look.characterType === "dog");
  for (const look of dogLooks) expect(look.palette).toEqual({ skin: RED });
});

test("利用者が変わったら、読み込みが終わるまで前の人の姿を映さない", () => {
  const { rerender } = render(<CharacterSelectScreen />);
  expect(mockPreviewLooks.length).toBeGreaterThan(0);

  mockUserId = "user-2";
  mockIsPaletteReady = false;
  const count = mockPreviewLooks.length;
  rerender(<CharacterSelectScreen />);

  expect(mockPreviewLooks).toHaveLength(count);
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
