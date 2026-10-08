import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const mockSetAudioModeAsync = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());

/** useAudioPlayer はソースごとに別のプレイヤーを返す（useTownBgmが2曲分呼ぶため）。 */
type MockPlayer = {
  loop: boolean;
  pause: ReturnType<typeof jest.fn>;
  play: ReturnType<typeof jest.fn>;
  seekTo: ReturnType<typeof jest.fn>;
  volume: number;
};
const players = new Map<unknown, MockPlayer>();
function makePlayer(): MockPlayer {
  return {
    loop: false,
    pause: jest.fn(),
    play: jest.fn(),
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

import { useTownBgm } from "../lib/audio";

/** 実タイマーのまま、短い切り替え間隔をテストに渡す（5分を待つのは現実的でないため）。 */
const ROTATE_MS = 50;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// start() した setInterval はテストが明示的に stop() しないと動き続け、次のテストや
// プロセス終了まで居残って干渉する。各テストの戻り値を覚えておき、必ず止める。
let activeStop: (() => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  players.clear();
  activeStop = null;
});

afterEach(() => {
  activeStop?.();
});

test("開始すると1曲目をループ再生する", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.3, ROTATE_MS));
  activeStop = () => result.current.stop();

  await act(async () => {
    await result.current.start();
  });

  const playerA = players.get("A")!;
  const playerB = players.get("B")!;
  expect(playerA.loop).toBe(true);
  expect(playerA.volume).toBe(0.3);
  expect(playerB.loop).toBe(true);
  expect(playerA.play).toHaveBeenCalledTimes(1);
  expect(playerB.play).not.toHaveBeenCalled();
});

test("間隔ごとに2曲目・1曲目を交互に流す", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;
  const playerB = players.get("B")!;

  await act(async () => {
    await result.current.start();
  });
  expect(playerA.play).toHaveBeenCalledTimes(1);

  await act(async () => {
    await wait(ROTATE_MS * 1.5);
  });
  expect(playerA.pause).toHaveBeenCalledTimes(1);
  expect(playerA.seekTo).toHaveBeenCalledWith(0);
  expect(playerB.play).toHaveBeenCalledTimes(1);

  await act(async () => {
    await wait(ROTATE_MS * 1.5);
  });
  expect(playerB.pause).toHaveBeenCalledTimes(1);
  expect(playerA.play).toHaveBeenCalledTimes(2);
});

test("止めると、再生中の曲を一時停止して先頭へ戻し、タイマーも止める", async () => {
  const { result } = renderHook(() => useTownBgm("A", "B", 0.25, ROTATE_MS));
  activeStop = () => result.current.stop();
  const playerA = players.get("A")!;
  const playerB = players.get("B")!;

  await act(async () => {
    await result.current.start();
  });
  // ここで1曲目（A）から2曲目（B）へ切り替わるのを待つ
  await act(async () => {
    await wait(ROTATE_MS * 1.5);
  });
  expect(playerB.play).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.stop();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(playerB.pause).toHaveBeenCalledTimes(1);
  expect(playerB.seekTo).toHaveBeenCalledWith(0);

  // 停止後はタイマーが止まっているので、時間が経っても何も起きない
  const playsBeforeWait = playerA.play.mock.calls.length + playerB.play.mock.calls.length;
  await act(async () => {
    await wait(ROTATE_MS * 5);
  });
  const playsAfterWait = playerA.play.mock.calls.length + playerB.play.mock.calls.length;
  expect(playsAfterWait).toBe(playsBeforeWait);
});
