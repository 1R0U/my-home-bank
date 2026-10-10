import { act, renderHook, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const mockSetAudioModeAsync = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());

/** useAudioPlayer はソースごとに別のプレイヤーを返す（useTownBgmが2曲分呼ぶため）。
 * 2曲目は切り替わるまで読み込まない仕様なので、最初は `undefined` キーで作られる。 */
type MockPlayer = {
  loop: boolean;
  pause: ReturnType<typeof jest.fn>;
  play: ReturnType<typeof jest.fn>;
  replace: ReturnType<typeof jest.fn>;
  seekTo: ReturnType<typeof jest.fn>;
  volume: number;
};
const players = new Map<unknown, MockPlayer>();
function makePlayer(): MockPlayer {
  return {
    loop: false,
    pause: jest.fn(),
    play: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn<() => Promise<void>>(() => Promise.resolve()),
    volume: 1,
  };
}
const mockUseAudioPlayer = jest.fn((source: unknown) => {
  if (!players.has(source)) players.set(source, makePlayer());
  return players.get(source);
});

jest.mock("expo-audio", () => ({
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...(args as [unknown])),
}));

import { AppState } from "react-native";
import { useTownBgm } from "../lib/audio";

/** アプリの前面・背面の切り替えをテストから起こせるようにする（lib/audio.ts のバックグラウンド検知用）。
 * react-native全体をモックすると他のネイティブモジュールの初期化が壊れるため、
 * 実物のAppStateに対して addEventListener だけ差し替える。 */
let appStateListener: ((state: string) => void) | null = null;

/** 実タイマーのまま、短い切り替え間隔をテストに渡す（5分を待つのは現実的でないため）。
 * 固定時間だけ待って判定すると、CIの負荷が高いときにタイマーの発火が遅れて落ちることが
 * あったため（1R0Uさんレビュー指摘）、待ち合わせは `waitFor`（ポーリングで条件を確認し、
 * 満たされたらすぐ進む）に任せる。 */
const ROTATE_MS = 30;

function goBackground() {
  AppState.currentState = "background";
  act(() => appStateListener?.("background"));
}
function goForeground() {
  AppState.currentState = "active";
  act(() => appStateListener?.("active"));
}

// start() した setTimeout はテストが明示的に stop() しないと動き続け、次のテストや
// プロセス終了まで居残って干渉する。各テストの戻り値を覚えておき、必ず止める。
let activeStop: (() => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  players.clear();
  activeStop = null;
  appStateListener = null;
  AppState.currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    appStateListener = listener as (state: string) => void;
    return { remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  activeStop?.();
});

test("開始すると1曲目をループ再生し、2曲目はまだ読み込まない", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.3, ROTATE_MS));
  activeStop = () => result.current.stop();

  await act(async () => {
    await result.current.start();
  });

  const playerA = players.get("A")!;
  expect(playerA.loop).toBe(true);
  expect(playerA.volume).toBe(0.3);
  expect(playerA.play).toHaveBeenCalledTimes(1);

  // 2曲目（lazy）はまだ読み込まれていない（1R0Uさんレビュー指摘：町に5分以上
  // いないことも多く、毎回読み込むと無駄が大きい）。
  const lazyPlayer = players.get(undefined)!;
  expect(lazyPlayer.replace).not.toHaveBeenCalled();
});

test("間隔ごとに2曲目・1曲目を交互に流し、2曲目は切り替わる直前に読み込む", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });
  expect(playerA.play).toHaveBeenCalledTimes(1);

  const lazyPlayer = await waitFor(() => {
    const player = players.get(undefined);
    expect(player?.replace).toHaveBeenCalledWith("B");
    return player!;
  });
  expect(playerA.pause).toHaveBeenCalledTimes(1);
  expect(playerA.seekTo).toHaveBeenCalledWith(0);
  await waitFor(() => expect(lazyPlayer.play).toHaveBeenCalledTimes(1));

  await waitFor(() => expect(playerA.play).toHaveBeenCalledTimes(2));
  expect(lazyPlayer.pause).toHaveBeenCalledTimes(1);
});

test("止めると、再生中の曲を一時停止して先頭へ戻し、タイマーも止める", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });
  // ここで1曲目（A）から2曲目（B）へ切り替わるのを待つ
  const lazyPlayer = await waitFor(() => {
    const player = players.get(undefined);
    expect(player?.play).toHaveBeenCalledTimes(1);
    return player!;
  });

  await act(async () => {
    result.current.stop();
    await Promise.resolve();
  });
  expect(lazyPlayer.pause).toHaveBeenCalledTimes(1);
  expect(lazyPlayer.seekTo).toHaveBeenCalledWith(0);

  // 停止後はタイマーが止まっているので、時間が経っても何も起きない
  const playsBeforeWait = playerA.play.mock.calls.length + lazyPlayer.play.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, ROTATE_MS * 5));
  const playsAfterWait = playerA.play.mock.calls.length + lazyPlayer.play.mock.calls.length;
  expect(playsAfterWait).toBe(playsBeforeWait);
});

test("画面を素早く離れて戻しても、切り替えまでの残り時間は引き継がれる（毎回0から数え直さない）", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });

  // ROTATE_MSの半分くらい鳴らしてから、画面を離れる（止める）→すぐ戻る（再開する）を
  // 何度か繰り返す。合計の経過時間がROTATE_MSを超えた時点で切り替わるはずで、
  // 毎回0から数え直すと（タウンとクエスト画面を行き来しても一度も切り替わらないという
  // 1R0Uさんレビュー指摘の再現）、ここでは永遠に切り替わらない。
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, ROTATE_MS / 2));
    await act(async () => {
      result.current.stop();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.start();
    });
  }

  // 合計の経過時間はROTATE_MSを超えているはずなので、少なくとも1回は切り替わっている。
  // 毎回0から数え直す実装だと、個々の待ち時間はROTATE_MS未満のため一度も切り替わらない。
  await waitFor(() => {
    const lazyPlayer = players.get(undefined);
    expect(lazyPlayer?.play).toHaveBeenCalled();
  });
  expect(playerA.pause).toHaveBeenCalled();
});

test("アプリがバックグラウンドに回るとタイマーを止めて位置を保ったまま一時停止し、復帰したら再開する", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });
  expect(playerA.play).toHaveBeenCalledTimes(1);

  goBackground();
  expect(playerA.pause).toHaveBeenCalledTimes(1);
  // バックグラウンドでは先頭に戻さない（画面を離れるときの stop() とは違う）。
  expect(playerA.seekTo).not.toHaveBeenCalled();

  // バックグラウンド中は時間が経っても切り替わらない
  const lazyPlayer = players.get(undefined);
  await new Promise((resolve) => setTimeout(resolve, ROTATE_MS * 3));
  expect(lazyPlayer?.play).not.toHaveBeenCalled();

  goForeground();
  await waitFor(() => expect(playerA.play).toHaveBeenCalledTimes(2));
});

test("フォーカスが外れている間にバックグラウンドへ回っても、復帰時に再生を始めない", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  // start() を一度も呼んでいない（画面がフォーカスされていない）状態でバックグラウンド遷移。
  goBackground();
  goForeground();

  await new Promise((resolve) => setTimeout(resolve, ROTATE_MS * 2));
  expect(playerA.play).not.toHaveBeenCalled();
});
