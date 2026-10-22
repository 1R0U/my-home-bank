import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchPlacedDecorations = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockInsertPlacedDecoration = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDeletePlacedDecoration = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdatePlacedDecoration = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/decorationService", () => ({
  deletePlacedDecoration: (...args: unknown[]) => mockDeletePlacedDecoration(...args),
  fetchPlacedDecorations: (...args: unknown[]) => mockFetchPlacedDecorations(...args),
  insertPlacedDecoration: (...args: unknown[]) => mockInsertPlacedDecoration(...args),
  updatePlacedDecoration: (...args: unknown[]) => mockUpdatePlacedDecoration(...args),
}));

import { INITIAL_MAP_OBJECTS } from "../lib/rpg-hub/mapObjects";
import { usePlacedDecorations } from "../lib/usePlacedDecorations";
import { useAppStore } from "../store";
import { useMapStore } from "../store/mapStore";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const user = (id: string) => ({
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id,
  name: "たろう",
  role: "child" as const,
});

const row = (overrides = {}) => ({
  asset_id: "decoration-tree",
  id: "row-1",
  position_x: 3,
  position_z: -4,
  rotation_y: 0,
  scale: 1,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({ user: null });
  useMapStore.setState({ objects: INITIAL_MAP_OBJECTS, placedDecorations: [] });
  mockFetchPlacedDecorations.mockResolvedValue([]);
  mockInsertPlacedDecoration.mockResolvedValue(undefined);
  mockDeletePlacedDecoration.mockResolvedValue(undefined);
  mockUpdatePlacedDecoration.mockResolvedValue(undefined);
});

test("読み込んだ装飾が、町の固定物に足される", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row(), row({ id: "row-2" })]);

  renderHook(() => usePlacedDecorations());
  await act(async () => undefined);

  const state = useMapStore.getState();
  expect(state.placedDecorations).toHaveLength(2);
  expect(state.objects).toHaveLength(INITIAL_MAP_OBJECTS.length + 2);
  // 町の固定物は消えていない
  expect(state.objects.slice(0, INITIAL_MAP_OBJECTS.length)).toEqual(INITIAL_MAP_OBJECTS);
});

test("大人が町に入っても、自分のIDで引く（町の中身は人ごとに分かれる）", async () => {
  // Issue #246: 大人もRPGハブへ入れるようにした。装飾が紐づくのはロールではなく
  // users.id なので、大人と子供で同じ庭が見えることはない
  useAppStore.setState({ user: { ...user(USER_A), role: "parent" } });

  renderHook(() => usePlacedDecorations());
  await act(async () => undefined);

  expect(mockFetchPlacedDecorations).toHaveBeenCalledWith(USER_A);
});

test("未ログインなら実APIを呼ばない", () => {
  renderHook(() => usePlacedDecorations());

  expect(mockFetchPlacedDecorations).not.toHaveBeenCalled();
  expect(useMapStore.getState().objects).toEqual(INITIAL_MAP_OBJECTS);
});

test("非UUIDのモックIDでは実APIを呼ばない", () => {
  // ログイン画面のモックアカウント。実APIを叩いても失敗するだけ（#174）
  useAppStore.setState({ user: user("user-child-1") });

  renderHook(() => usePlacedDecorations());

  expect(mockFetchPlacedDecorations).not.toHaveBeenCalled();
});

test("取得に失敗しても町は表示する", async () => {
  // 装飾が出ないのは我慢できるが、建物へ行けなくなるのは困る
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockRejectedValue(new Error("network error"));

  renderHook(() => usePlacedDecorations());
  await act(async () => undefined);

  expect(useMapStore.getState().objects).toEqual(INITIAL_MAP_OBJECTS);
});

test("壊れた行が混ざっていても、まっとうな行は表示する", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([
    row({ id: "ok-1" }),
    row({ asset_id: "decoration-nonexistent", id: "broken" }),
    row({ id: "ok-2" }),
  ]);

  renderHook(() => usePlacedDecorations());
  await act(async () => undefined);

  expect(useMapStore.getState().placedDecorations).toHaveLength(2);
});

test("ユーザーを切り替えたら、前の人の装飾を残さない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row()]);

  const view = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);
  expect(useMapStore.getState().placedDecorations).toHaveLength(1);

  // Bの取得は終わらせない。この時点でAの装飾が残っていたら漏れている
  mockFetchPlacedDecorations.mockReturnValue(new Promise(() => undefined));
  useAppStore.setState({ user: user(USER_B) });
  view.rerender(undefined);
  await act(async () => undefined);

  expect(useMapStore.getState().placedDecorations).toEqual([]);
});

test("古い応答が後から返ってきても、その値を採用しない", async () => {
  useAppStore.setState({ user: user(USER_A) });
  let resolveFirst;
  mockFetchPlacedDecorations.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );

  const view = renderHook(() => usePlacedDecorations());

  mockFetchPlacedDecorations.mockResolvedValueOnce([row({ id: "new" })]);
  useAppStore.setState({ user: user(USER_B) });
  view.rerender(undefined);

  await act(async () => {
    // Aの応答がBへ切り替えた後に届く
    resolveFirst([row({ id: "old" }), row({ id: "old-2" })]);
  });

  const placed = useMapStore.getState().placedDecorations;
  expect(placed).toHaveLength(1);
  expect(placed[0].id).toContain("new");
});

test("空のまま空を書き直しても、objects を作り直さない", async () => {
  // 作り直すと setMap が飛び、WebView がメッシュを全部捨てて組み直す
  // （住人の位置も初期化される）。読み込みの入口で空の代入が続くため止めている
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([]);

  renderHook(() => usePlacedDecorations());
  const before = useMapStore.getState().objects;
  await act(async () => undefined);

  expect(useMapStore.getState().objects).toBe(before);
});

// --- 置く・しまう（Issue #224） ---

test("置くと保存してから読み直す", async () => {
  useAppStore.setState({ user: user(USER_A) });

  const { result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);

  mockFetchPlacedDecorations.mockResolvedValue([row()]);
  await act(async () => {
    await result.current.place({
      assetId: "decoration-rock",
      rotationY: 0.5,
      scale: 1,
      x: 2,
      z: 3,
    });
  });

  expect(mockInsertPlacedDecoration).toHaveBeenCalledWith(USER_A, {
    assetId: "decoration-rock",
    rotationY: 0.5,
    scale: 1,
    x: 2,
    z: 3,
  });
  expect(useMapStore.getState().placedDecorations).toHaveLength(1);
});

test("しまうときは、マップ上のidから接頭辞を外して渡す", async () => {
  // DBのidは接頭辞を持たない。付けたまま渡すと、どの行も消えない
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "row-1" })]);

  const { result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);
  const objectId = useMapStore.getState().placedDecorations[0].id;

  mockFetchPlacedDecorations.mockResolvedValue([]);
  await act(async () => {
    await result.current.remove(objectId);
  });

  expect(mockDeletePlacedDecoration).toHaveBeenCalledWith(USER_A, "row-1");
  expect(useMapStore.getState().placedDecorations).toHaveLength(0);
});

test("モックアカウントでは書き込まない", () => {
  // IDがUUIDでないと書き込みが必ず失敗する（#174）
  useAppStore.setState({ user: user("user-child-1") });

  const { result } = renderHook(() => usePlacedDecorations());
  result.current.place({ assetId: "decoration-rock", rotationY: 0, scale: 1, x: 0, z: 0 });

  expect(mockInsertPlacedDecoration).not.toHaveBeenCalled();
});

test("モックアカウントでは、DBへ書かずに画面の中だけで置く・回す・しまう（Issue #477）", () => {
  useAppStore.setState({ user: user("user-child-1") });
  const { result } = renderHook(() => usePlacedDecorations());

  act(() => {
    void result.current.place({ assetId: "decoration-rock", rotationY: 0, scale: 1, x: 1.8, z: 0.9 });
  });
  const placed = useMapStore.getState().placedDecorations;
  expect(placed).toHaveLength(1);
  expect(placed[0].model).toBe("decoration-rock");
  expect(placed[0].position.x).toBe(1.8);
  expect(useMapStore.getState().objects).toContain(placed[0]);

  act(() => {
    void result.current.update(placed[0].id, { rotationY: Math.PI });
  });
  expect(useMapStore.getState().placedDecorations[0].rotationY).toBe(Math.PI);

  act(() => {
    void result.current.remove(placed[0].id);
  });
  expect(useMapStore.getState().placedDecorations).toHaveLength(0);
  expect(mockInsertPlacedDecoration).not.toHaveBeenCalled();
  expect(mockUpdatePlacedDecoration).not.toHaveBeenCalled();
  expect(mockDeletePlacedDecoration).not.toHaveBeenCalled();
});

test("書き込み中にユーザーが変わったら、前の人の庭を読み直さない", async () => {
  // 読み直すと staleGuard の「最後に始めた取得が最新」に乗ってしまい、
  // 今いる人の画面へ前の人の装飾が入る（#222 で踏んだのと同じ形）
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "a-1" })]);

  const { rerender, result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);

  let finishInsert: () => void = () => undefined;
  mockInsertPlacedDecoration.mockReturnValue(new Promise<void>((resolve) => (finishInsert = resolve)));
  const placing = result.current.place({
    assetId: "decoration-rock",
    rotationY: 0,
    scale: 1,
    x: 2,
    z: 3,
  });

  useAppStore.setState({ user: user(USER_B) });
  mockFetchPlacedDecorations.mockResolvedValue([]);
  rerender(undefined);
  await act(async () => undefined);
  expect(useMapStore.getState().placedDecorations).toHaveLength(0);

  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "a-1" }), row({ id: "a-2" })]);
  await act(async () => {
    finishInsert();
    await placing;
  });

  expect(useMapStore.getState().placedDecorations).toHaveLength(0);
});

// --- 動かす・回す（Issue #477） ---

test("回す・動かすと、保存を待たずに画面へ出し、接頭辞を外したidで保存する", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "row-1" })]);
  const { result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);
  const objectId = useMapStore.getState().placedDecorations[0].id;

  let finishUpdate: () => void = () => undefined;
  mockUpdatePlacedDecoration.mockReturnValue(new Promise<void>((resolve) => (finishUpdate = resolve)));
  let updating: Promise<void> = Promise.resolve();
  act(() => {
    updating = result.current.update(objectId, { rotationY: Math.PI / 2, x: 5 });
  });

  // 保存が終わる前に、もう向きと位置が変わっている
  const moved = useMapStore.getState().placedDecorations[0];
  expect(moved.rotationY).toBe(Math.PI / 2);
  expect(moved.position.x).toBe(5);
  expect(moved.position.z).toBe(-4);

  await act(async () => {
    finishUpdate();
    await updating;
  });
  expect(mockUpdatePlacedDecoration).toHaveBeenCalledWith(USER_A, "row-1", { rotationY: Math.PI / 2, x: 5 });
  // 読み直さない（まだ送っていない向きが、一瞬前の向きへ戻らないように）
  expect(mockFetchPlacedDecorations).toHaveBeenCalledTimes(1);
});

test("続けて回したときは、押した順に1つずつ保存する（最後に押した向きが残る）", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "row-1" })]);
  const { result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);
  const objectId = useMapStore.getState().placedDecorations[0].id;

  let finishFirst: () => void = () => undefined;
  mockUpdatePlacedDecoration.mockReturnValueOnce(new Promise<void>((resolve) => (finishFirst = resolve)));
  let second: Promise<void> = Promise.resolve();
  act(() => {
    void result.current.update(objectId, { rotationY: Math.PI / 2 });
    second = result.current.update(objectId, { rotationY: Math.PI });
  });
  await act(async () => undefined);

  // 1つ目が終わるまで、2つ目は送らない
  expect(mockUpdatePlacedDecoration).toHaveBeenCalledTimes(1);
  expect(useMapStore.getState().placedDecorations[0].rotationY).toBe(Math.PI);

  await act(async () => {
    finishFirst();
    await second;
  });
  expect(mockUpdatePlacedDecoration).toHaveBeenCalledTimes(2);
  expect(mockUpdatePlacedDecoration).toHaveBeenLastCalledWith(USER_A, "row-1", { rotationY: Math.PI });
});

test("保存に失敗したら、DBから読み直して元へ戻す", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "row-1" })]);
  const { result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);
  const objectId = useMapStore.getState().placedDecorations[0].id;

  mockUpdatePlacedDecoration.mockRejectedValue(new Error("network error"));
  await act(async () => {
    await expect(result.current.update(objectId, { x: 9 })).rejects.toThrow("network error");
  });

  expect(useMapStore.getState().placedDecorations[0].position.x).toBe(3);
});

test("1つ目の保存が失敗しても、後ろに積まれた書き込みが終わってから読み直す（CodeRabbitレビュー指摘）", async () => {
  useAppStore.setState({ user: user(USER_A) });
  mockFetchPlacedDecorations.mockResolvedValue([row({ id: "row-1" })]);
  const { result } = renderHook(() => usePlacedDecorations());
  await act(async () => undefined);
  const objectId = useMapStore.getState().placedDecorations[0].id;
  const fetchesBefore = mockFetchPlacedDecorations.mock.calls.length;

  let failFirst: (e: Error) => void = () => undefined;
  let finishSecond: () => void = () => undefined;
  mockUpdatePlacedDecoration
    .mockReturnValueOnce(new Promise<void>((_, reject) => (failFirst = reject)))
    .mockReturnValueOnce(new Promise<void>((resolve) => (finishSecond = resolve)));
  let first: Promise<void> = Promise.resolve();
  act(() => {
    first = result.current.update(objectId, { rotationY: Math.PI / 2 }).catch(() => undefined);
    void result.current.update(objectId, { rotationY: Math.PI });
  });

  await act(async () => {
    failFirst(new Error("network error"));
  });
  // 2つ目の書き込みが終わるまで、読み直さない（読み直すと2つ目の前の値になる）
  expect(mockFetchPlacedDecorations.mock.calls.length).toBe(fetchesBefore);

  await act(async () => {
    finishSecond();
    await first;
  });
  expect(mockFetchPlacedDecorations.mock.calls.length).toBe(fetchesBefore + 1);
});

test("モックアカウントでは、回しても書き込まない", () => {
  useAppStore.setState({ user: user("user-child-1") });

  const { result } = renderHook(() => usePlacedDecorations());
  result.current.update("placed-row-1", { rotationY: Math.PI });

  expect(mockUpdatePlacedDecoration).not.toHaveBeenCalled();
});
