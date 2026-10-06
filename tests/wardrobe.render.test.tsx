import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchOwnedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchEquippedItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockSaveEquippedItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/wardrobeService", () => ({
  fetchEquippedItems: (...args: unknown[]) => mockFetchEquippedItems(...args),
  fetchOwnedItems: (...args: unknown[]) => mockFetchOwnedItems(...args),
  saveEquippedItem: (...args: unknown[]) => mockSaveEquippedItem(...args),
}));

import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { DEFAULT_PLAYER_EQUIPMENT } from "../lib/rpg-hub/equipment";
import { useWardrobe } from "../lib/useWardrobe";
import { useAppStore } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const HAT = RPG_HUB_ASSETS.wearableHat;
const GLASSES = RPG_HUB_ASSETS.wearableGlasses;

const user = (id: string) => ({
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id,
  name: "たろう",
  role: "child" as const,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: null });
  useWardrobeStore.setState({ equipment: {}, equipmentLoadedFor: undefined, ownedAssetIds: [] });
  mockFetchOwnedItems.mockResolvedValue([]);
  mockFetchEquippedItems.mockResolvedValue([]);
  mockSaveEquippedItem.mockResolvedValue(undefined);
});

test("読み込んだ所有と装備が反映される", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }, { asset_id: GLASSES }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  renderHook(() => useWardrobe());
  await act(async () => undefined);

  const state = useWardrobeStore.getState();
  expect(state.ownedAssetIds).toHaveLength(2);
  expect(state.equipment).toEqual({ head: HAT });
});

test("モックアカウントでは既定の装備を着せ、実APIを呼ばない", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）。
  // 何も着ていないカエルを出すより、他の画面と同じモックの見え方にそろえる
  useAppStore.setState({ user: user("user-child-1") });

  renderHook(() => useWardrobe());

  expect(mockFetchOwnedItems).not.toHaveBeenCalled();
  expect(useWardrobeStore.getState().equipment).toEqual(DEFAULT_PLAYER_EQUIPMENT);
  // 買えないし脱げないので、選ばせるものは出さない
  expect(useWardrobeStore.getState().ownedAssetIds).toEqual([]);
});

test("未ログインなら実APIを呼ばない", () => {
  renderHook(() => useWardrobe());

  expect(mockFetchOwnedItems).not.toHaveBeenCalled();
  expect(mockFetchEquippedItems).not.toHaveBeenCalled();
});

test("ユーザーが変わったら、取得を待たずに前の人の装備を消す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  const { rerender } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  expect(useWardrobeStore.getState().equipment).toEqual({ head: HAT });

  // 次の人の取得は終わらせない。切り替え直後に前の人の帽子が見えないこと（#147 と同じ形）
  let resolveOwned: (value: unknown) => void = () => undefined;
  mockFetchOwnedItems.mockReturnValue(new Promise((resolve) => (resolveOwned = resolve)));
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);

  expect(useWardrobeStore.getState().equipment).toEqual({});
  resolveOwned([]);
});

test("取得に失敗したら何も着ていない状態にする", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockRejectedValue(new Error("network"));

  renderHook(() => useWardrobe());
  await act(async () => undefined);

  expect(useWardrobeStore.getState().equipment).toEqual({});
});

test("着け替えると保存してから読み直す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);

  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);
  await act(async () => {
    await result.current.saveEquipment([{ assetId: HAT, slot: "head" }]);
  });

  expect(mockSaveEquippedItem).toHaveBeenCalledWith(USER_A, "head", HAT);
  expect(useWardrobeStore.getState().equipment).toEqual({ head: HAT });
});

test("確定した複数の枠を順に保存し、読み直しは最後の1回だけ（Issue #344）", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }, { asset_id: GLASSES }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  mockFetchEquippedItems.mockClear();

  mockFetchEquippedItems.mockResolvedValue([{ asset_id: GLASSES, slot: "face" }]);
  await act(async () => {
    await result.current.saveEquipment([
      { assetId: GLASSES, slot: "face" },
      { assetId: null, slot: "head" },
    ]);
  });

  expect(mockSaveEquippedItem.mock.calls).toEqual([
    [USER_A, "face", GLASSES],
    [USER_A, "head", null],
  ]);
  expect(mockFetchEquippedItems).toHaveBeenCalledTimes(1);
  expect(useWardrobeStore.getState().equipment).toEqual({ face: GLASSES });
});

test("途中の枠で保存に失敗しても、読み直してから失敗を伝える（Issue #344）", async () => {
  // 保存できた枠と保存できなかった枠が混ざる。DBの今の状態を出しておかないと、
  // 何が保存されたのか分からなくなる
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }, { asset_id: GLASSES }]);
  mockFetchEquippedItems.mockResolvedValue([]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);

  mockSaveEquippedItem.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: GLASSES, slot: "face" }]);
  let thrown: unknown = null;
  await act(async () => {
    await result.current
      .saveEquipment([
        { assetId: GLASSES, slot: "face" },
        { assetId: HAT, slot: "head" },
      ])
      .catch((e: unknown) => {
        thrown = e;
      });
  });

  expect(thrown).toBeInstanceOf(Error);
  expect(useWardrobeStore.getState().equipment).toEqual({ face: GLASSES });
});

test("変更が無ければ何も保存しない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);

  await act(async () => {
    await result.current.saveEquipment([]);
  });

  expect(mockSaveEquippedItem).not.toHaveBeenCalled();
});

test("保存中にユーザーが変わったら、前の人の装備を読み直さない", async () => {
  // staleGuard は「古いレスポンス」を無視するだけで、**切替後に新しく始まった取得は
  // 必ず最新になる**。保存の完了を待っていた古い reload をそのまま走らせると、
  // 今いる人の画面に前の人の装備が入る（#147 と同じ形）
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([]);

  const { rerender, result } = renderHook(() => useWardrobe());
  await act(async () => undefined);

  // Aの保存を宙に浮かせたまま、Bへ切り替える
  let finishSave: () => void = () => undefined;
  mockSaveEquippedItem.mockReturnValue(new Promise<void>((resolve) => (finishSave = resolve)));
  const equipping = result.current.saveEquipment([{ assetId: HAT, slot: "head" }]);

  useAppStore.setState({ user: user(USER_B) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: GLASSES }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: GLASSES, slot: "face" }]);
  rerender(undefined);
  await act(async () => undefined);
  expect(useWardrobeStore.getState().equipment).toEqual({ face: GLASSES });

  // ここでAの保存が終わる。Aの取得が走るとBの画面がAの装備で上書きされる
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);
  await act(async () => {
    finishSave();
    await equipping;
  });

  expect(useWardrobeStore.getState().equipment).toEqual({ face: GLASSES });
});

test("同じ内容を読み直しても参照が変わらない", async () => {
  // 変わると画面の effect が再実行され、WebView へ同じ装備を送り直して帽子を作り直す
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  const before = useWardrobeStore.getState();

  await act(async () => {
    await result.current.reload();
  });
  const after = useWardrobeStore.getState();

  expect(after.equipment).toBe(before.equipment);
  expect(after.ownedAssetIds).toBe(before.ownedAssetIds);
});

test("読み込みが終わるまで isReady は立たない（Issue #306）", async () => {
  // アイコンの肖像は isReady を見てから描く。読み込み前の「何も着ていない姿」で
  // 描いてしまうと、すぐ描き直すことになるため
  useAppStore.setState({ user: user(USER_A) });
  let resolveOwned: (value: unknown) => void = () => undefined;
  mockFetchOwnedItems.mockReturnValue(new Promise((resolve) => (resolveOwned = resolve)));
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  expect(result.current.isReady).toBe(false);

  await act(async () => resolveOwned([{ asset_id: HAT }]));
  expect(result.current.isReady).toBe(true);
  expect(useWardrobeStore.getState().equipmentLoadedFor).toBe(USER_A);
});

test("取得に失敗しても、その人について確定したものとして isReady を立てる", async () => {
  // 立てないと、アイコンがいつまでも描かれない
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockRejectedValue(new Error("network"));

  const { result } = renderHook(() => useWardrobe());
  await act(async () => undefined);

  expect(result.current.isReady).toBe(true);
});

test("モックアカウントは既定の装備で確定している", () => {
  useAppStore.setState({ user: user("user-child-1") });

  const { result } = renderHook(() => useWardrobe());

  expect(result.current.isReady).toBe(true);
  expect(useWardrobeStore.getState().equipmentLoadedFor).toBeNull();
});

test("ユーザーが変わったら、次の人の読み込みが終わるまで isReady を下ろす", async () => {
  useAppStore.setState({ user: user(USER_A) });
  const { rerender, result } = renderHook(() => useWardrobe());
  await act(async () => undefined);
  expect(result.current.isReady).toBe(true);

  let resolveOwned: (value: unknown) => void = () => undefined;
  mockFetchOwnedItems.mockReturnValue(new Promise((resolve) => (resolveOwned = resolve)));
  useAppStore.setState({ user: user(USER_B) });
  rerender(undefined);

  // Aの装備のまま「Bについて確定」と扱わない
  expect(result.current.isReady).toBe(false);
  await act(async () => resolveOwned([]));
  expect(result.current.isReady).toBe(true);
});

test("同じ人のまま別の画面がこのフックを使い始めても、今の装備を消さない（Issue #306）", async () => {
  // ホーム画面・設定画面のアイコンもこのフックを使う。マウントのたびに消すと、
  // 開いたままの町のキャラクターが一瞬裸になる
  useAppStore.setState({ user: user(USER_A) });
  mockFetchOwnedItems.mockResolvedValue([{ asset_id: HAT }]);
  mockFetchEquippedItems.mockResolvedValue([{ asset_id: HAT, slot: "head" }]);
  renderHook(() => useWardrobe());
  await act(async () => undefined);

  const seen: unknown[] = [];
  const unsubscribe = useWardrobeStore.subscribe((state) => seen.push(state.equipment));
  // 2つ目の画面。取得は終わらせないでおく
  mockFetchOwnedItems.mockReturnValue(new Promise(() => undefined));
  const second = renderHook(() => useWardrobe());
  unsubscribe();

  expect(seen).not.toContainEqual({});
  expect(useWardrobeStore.getState().equipment).toEqual({ head: HAT });
  expect(second.result.current.isReady).toBe(true);
});
