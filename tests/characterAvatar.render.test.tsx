// ホーム画面・設定画面のアイコンに出す、自分のキャラクター（Issue #306）のテスト。
import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchCharacterType = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchCharacterPalette = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/characterAppearanceService", () => ({
  fetchCharacterPalette: (...args: unknown[]) => mockFetchCharacterPalette(...args),
  fetchCharacterType: (...args: unknown[]) => mockFetchCharacterType(...args),
  savePaletteColor: jest.fn(),
  saveCharacterType: jest.fn(),
}));

const mockFetchOwnedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchEquippedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/wardrobeService", () => ({
  fetchEquippedItems: (...args: unknown[]) => mockFetchEquippedItems(...args),
  fetchOwnedItems: (...args: unknown[]) => mockFetchOwnedItems(...args),
  saveEquippedItem: jest.fn(),
}));

// 3Dを描く WebView の代わり。受け取った見た目を記録し、描き終わり・失敗をテストから起こす
type RendererProps = {
  look: PortraitLook;
  onError?: (message: string) => void;
  onRendered: (key: string, dataUrl: string) => void;
};
const mockRendererProps: RendererProps[] = [];
jest.mock("../components/rpg-hub-web/PortraitRenderer", () => {
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    PortraitRenderer: (props: RendererProps) => {
      mockRendererProps.push(props);
      return createElement(Pressable, { testID: "mock-portrait-renderer" });
    },
  };
});

import CharacterAvatar from "../components/CharacterAvatar";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { DEFAULT_PLAYER_EQUIPMENT } from "../lib/rpg-hub/equipment";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { useAppStore } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { usePortraitStore } from "../store/portraitStore";
import { useWardrobeStore } from "../store/wardrobeStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const HAT = RPG_HUB_ASSETS.wearableHat;
const PNG = "data:image/png;base64,iVBORw0KGgo=";

const user = (id: string) => ({
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id,
  name: "おとうさん",
  role: "parent" as const,
});

/** @returns 最後に描くよう頼まれた見た目 */
const lastRequest = () => mockRendererProps[mockRendererProps.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  mockRendererProps.length = 0;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: null });
  useAppearanceStore.setState({
    characterType: "frog",
    characterTypeLoadedFor: null,
    palette: {},
    paletteLoadedFor: null,
  });
  useWardrobeStore.setState({ equipment: {}, equipmentLoadedFor: undefined, ownedAssetIds: [] });
  useMapStore.setState({ currentSeason: "autumn" });
  usePortraitStore.setState({ images: {} });
  mockFetchCharacterType.mockResolvedValue("cat");
  mockFetchCharacterPalette.mockResolvedValue({ accent: "#e74c3c" });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);
});

test("種類・色・装備をすべて読み込んでから、その見た目で描くよう頼む", async () => {
  useAppStore.setState({ user: user(USER_A) });
  let resolveType: (value: unknown) => void = () => undefined;
  mockFetchCharacterType.mockReturnValue(new Promise((resolve) => (resolveType = resolve)));

  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);

  // 種類の読み込みが終わるまでは描かない（既定のカエルで描いてしまわないように）
  expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();

  await act(async () => resolveType("cat"));

  expect(screen.getByTestId("mock-portrait-renderer")).toBeTruthy();
  expect(lastRequest().look).toEqual({
    characterType: "cat",
    equipment: { head: HAT },
    // 保存した色はカエルにだけ当てる。ねこは既定の色のまま描く
    palette: {},
    season: "autumn",
  });
});

test("描き終わるまでは人型のアイコン、描き終わったら自分のキャラクターの画像を出す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  render(<CharacterAvatar size={96} />);
  await act(async () => undefined);

  expect(screen.queryByTestId("character-avatar-image")).toBeNull();
  expect(screen.getByLabelText("自分のキャラクター")).toBeTruthy();

  const request = lastRequest();
  await act(async () => request.onRendered(getPortraitKey(request.look), PNG));

  expect(screen.getByTestId("character-avatar-image").props.source).toEqual({ uri: PNG });
  expect(screen.getByLabelText("自分のキャラクター（ねこ）")).toBeTruthy();
  // 描き終わったら、3Dを描く WebView は外す
  expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();
});

test("カエルを選んでいる人は、保存した色で描く", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchCharacterType.mockResolvedValue("frog");

  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);

  expect(lastRequest().look.characterType).toBe("frog");
  expect(lastRequest().look.palette).toEqual({ accent: "#e74c3c" });
});

test("一度描いた見た目は、描き直さずにすぐ出す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  const key = getPortraitKey({
    characterType: "cat",
    equipment: { head: HAT },
    palette: {},
    season: "autumn",
  });
  usePortraitStore.setState({ images: { [key]: PNG } });

  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);

  expect(screen.getByTestId("character-avatar-image").props.source).toEqual({ uri: PNG });
  expect(mockRendererProps).toHaveLength(0);
});

test("着せ替えて見た目が変わったら描き直す。描き直す間は前の画像を出し続ける", async () => {
  useAppStore.setState({ user: user(USER_A) });
  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);
  const first = lastRequest();
  await act(async () => first.onRendered(getPortraitKey(first.look), PNG));

  // 帽子を脱いだ
  await act(async () => useWardrobeStore.getState().setWardrobe([HAT], {}, USER_A));

  expect(lastRequest().look.equipment).toEqual({});
  // 人型アイコンへ戻らない（ちらつかない）
  expect(screen.getByTestId("character-avatar-image").props.source).toEqual({ uri: PNG });

  const second = lastRequest();
  await act(async () => second.onRendered(getPortraitKey(second.look), `${PNG}2`));
  expect(screen.getByTestId("character-avatar-image").props.source).toEqual({ uri: `${PNG}2` });
});

test("前の見た目の画像が遅れて届いても、今の見た目の画像としては使わない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);
  const stale = lastRequest();

  await act(async () => useWardrobeStore.getState().setWardrobe([HAT], {}, USER_A));
  // 帽子をかぶっていたときの画像が、今ごろ届いた
  await act(async () => stale.onRendered(getPortraitKey(stale.look), PNG));

  // 今の見た目（帽子なし）の画像はまだ無いので、描き直しを続ける
  expect(screen.getByTestId("mock-portrait-renderer")).toBeTruthy();
  expect(lastRequest().look.equipment).toEqual({});
});

test("利用者が切り替わったら、次の人の画像ができるまで前の人の姿を出さない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);
  const first = lastRequest();
  await act(async () => first.onRendered(getPortraitKey(first.look), PNG));
  expect(screen.getByTestId("character-avatar-image")).toBeTruthy();

  // 次の人は何も着ていない（見た目が違うので描き直しになる）
  mockFetchEquippedItems.mockResolvedValue([]);
  await act(async () => useAppStore.setState({ user: user(USER_B) }));
  await act(async () => undefined);

  expect(screen.queryByTestId("character-avatar-image")).toBeNull();
});

test("描けなかったときは人型のアイコンのまま、同じ見た目を描き直し続けない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);

  await act(async () => lastRequest().onError?.("WebGL が使えません"));

  expect(screen.queryByTestId("mock-portrait-renderer")).toBeNull();
  expect(screen.queryByTestId("character-avatar-image")).toBeNull();
  expect(screen.getByLabelText("自分のキャラクター")).toBeTruthy();
});

test("キャラクターを選んだことが無い人・モックアカウントは、既定のカエルを町と同じ装備で描く", async () => {
  // IDがUUIDでないのはモックアカウント（#174）。DBは読まない
  useAppStore.setState({ user: user("user-parent-1") });
  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);

  expect(mockFetchCharacterType).not.toHaveBeenCalled();
  expect(lastRequest().look).toEqual({
    characterType: "frog",
    equipment: DEFAULT_PLAYER_EQUIPMENT,
    palette: {},
    season: "autumn",
  });
});

test("読み上げでは、アイコン全体を1つの画像として扱う", async () => {
  useAppStore.setState({ user: user(USER_A) });
  render(<CharacterAvatar size={56} />);
  await act(async () => undefined);

  const avatar = screen.getByLabelText("自分のキャラクター");
  expect(avatar.props.accessible).toBe(true);
  expect(avatar.props.accessibilityRole).toBe("image");
});
