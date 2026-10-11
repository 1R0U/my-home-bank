import { act, renderHook } from "@testing-library/react-native";
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

/** 偽タイマーで短い切り替え間隔を進める（5分を待つのは現実的でないため）。
 * 実タイマー＋固定時間待ちは、CIの負荷が高いと切り替えが複数回進んでしまい
 * 回数の確認が落ちることがあった（1R0Uさんレビュー指摘）ため、`jest.advanceTimersByTime`
 * で1回分ずつ進めて、そのつど確認する。 */
const ROTATE_MS = 1000;

/** タイマー発火後に始まる非同期処理（play()が待つPromiseチェーンなど）を
 * マイクロタスクとして流し切る。 */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flushMicrotasks();
  });
}

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
  jest.useFakeTimers();
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
  jest.useRealTimers();
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

  await advance(ROTATE_MS);
  const lazyPlayer = players.get(undefined)!;
  expect(lazyPlayer.replace).toHaveBeenCalledWith("B");
  expect(playerA.pause).toHaveBeenCalledTimes(1);
  expect(playerA.seekTo).toHaveBeenCalledWith(0);
  expect(lazyPlayer.play).toHaveBeenCalledTimes(1);

  await advance(ROTATE_MS);
  expect(lazyPlayer.pause).toHaveBeenCalledTimes(1);
  expect(playerA.play).toHaveBeenCalledTimes(2);
});

test("止めると、再生中の曲を一時停止して先頭へ戻し、タイマーも止める", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });
  // ここで1曲目（A）から2曲目（B）へ切り替わるのを進める
  await advance(ROTATE_MS);
  const lazyPlayer = players.get(undefined)!;
  expect(lazyPlayer.play).toHaveBeenCalledTimes(1);

  await act(async () => {
    result.current.stop();
    await flushMicrotasks();
  });
  expect(lazyPlayer.pause).toHaveBeenCalledTimes(1);
  expect(lazyPlayer.seekTo).toHaveBeenCalledWith(0);

  // 停止後はタイマーが止まっているので、時間が経っても何も起きない
  const playsBeforeAdvance = playerA.play.mock.calls.length + lazyPlayer.play.mock.calls.length;
  await advance(ROTATE_MS * 5);
  const playsAfterAdvance = playerA.play.mock.calls.length + lazyPlayer.play.mock.calls.length;
  expect(playsAfterAdvance).toBe(playsBeforeAdvance);
});

test("画面を素早く離れて戻しても、切り替えまでの残り時間は引き継がれる（毎回0から数え直さない）", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });

  // ROTATE_MSの3割ずつ鳴らしてから、画面を離れる（止める）→すぐ戻る（再開する）を
  // 3回繰り返す（合計90%、まだ切り替わらない）。毎回0から数え直すと（タウンと
  // クエスト画面を行き来しても一度も切り替わらないという1R0Uさんレビュー指摘の
  // 再現）、ここでは永遠に切り替わらない。
  for (let i = 0; i < 3; i += 1) {
    await advance(ROTATE_MS * 0.3);
    await act(async () => {
      result.current.stop();
      await flushMicrotasks();
    });
    await act(async () => {
      await result.current.start();
    });
  }
  // 残り10%分を進めると、積算した経過時間が合計ROTATE_MSを超えて切り替わる。
  await advance(ROTATE_MS * 0.2);

  const lazyPlayer = players.get(undefined);
  expect(lazyPlayer?.play).toHaveBeenCalledTimes(1);
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
  await advance(ROTATE_MS * 3);
  expect(lazyPlayer?.play).not.toHaveBeenCalled();

  await act(async () => {
    goForeground();
    await flushMicrotasks();
  });
  expect(playerA.play).toHaveBeenCalledTimes(2);
});

test("フォーカスが外れている間にバックグラウンドへ回っても、復帰時に再生を始めない", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  // start() を一度も呼んでいない（画面がフォーカスされていない）状態でバックグラウンド遷移。
  goBackground();
  await act(async () => {
    goForeground();
    await flushMicrotasks();
  });

  await advance(ROTATE_MS * 2);
  expect(playerA.play).not.toHaveBeenCalled();
});

test("play()を待っている間に画面を離れても、残っていたタイマーが別の画面でBGMを鳴らさない", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;

  await act(async () => {
    await result.current.start();
  });
  expect(playerA.play).toHaveBeenCalledTimes(1);

  // 巻き戻し（seekTo）の完了を遅らせ、「再開のplay()が巻き戻し待ちで止まっている間に
  // もう一度離れる」状況を再現する（1R0Uさんレビュー指摘）。setAudioModeAsyncは
  // モジュール内でキャッシュされ2回目以降は呼ばれないため、ここでは各hookインスタンス
  // 固有のresetPromiseRef（seekToの完了待ち）を使う。
  let resolveSeek: () => void = () => undefined;
  playerA.seekTo.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveSeek = resolve)),
  );

  await act(async () => {
    result.current.stop();
    // seekTo(0)が実際に呼ばれる（resetPromiseRefの.thenが走る）ところまで進める
    await flushMicrotasks();
  });
  expect(playerA.seekTo).toHaveBeenCalledWith(0);

  let restarting: Promise<void> | undefined;
  await act(async () => {
    restarting = result.current.start();
    // play()がresetPromiseRef（seekToの完了待ち）で止まるところまで進める
    await flushMicrotasks();
  });
  // 巻き戻し待ちでplay()がまだ解決していない間に、もう一度画面を離れる
  act(() => result.current.stop());

  resolveSeek();
  await act(async () => {
    await restarting;
    await flushMicrotasks();
  });

  // 1回目のstart()分の1回だけで、再開によるplay()は呼ばれていない
  expect(playerA.play).toHaveBeenCalledTimes(1);

  // タイマーが残っていないので、時間が経っても何も鳴らない
  await advance(ROTATE_MS * 5);
  expect(playerA.play).toHaveBeenCalledTimes(1);
  const lazyPlayer = players.get(undefined);
  expect(lazyPlayer?.play).not.toHaveBeenCalled();
});
