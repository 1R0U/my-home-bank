import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockSetAudioModeAsync = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockPlayer = {
  loop: false,
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn<() => Promise<void>>(() => Promise.resolve()),
  volume: 1,
};
const mockUseAudioPlayer = jest.fn<(...args: unknown[]) => typeof mockPlayer>(() => mockPlayer);
const mockCreateAudioPlayer = jest.fn<(...args: unknown[]) => typeof mockPlayer>(() => mockPlayer);

jest.mock("expo-audio", () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args),
}));

import { playSoundEffect, SOUND_EFFECTS, useLoopingAudio, useSoundEffect } from "../lib/audio";

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.loop = false;
  mockPlayer.volume = 1;
});

test("BGMの初期化中に画面を離れた場合は、遅れて再生を始めない", async () => {
  let finishPreparing: () => void = () => undefined;
  mockSetAudioModeAsync.mockImplementationOnce(
    () => new Promise<void>((resolve) => (finishPreparing = resolve)),
  );
  const { result } = renderHook(() => useLoopingAudio(2));

  let starting: Promise<void> | undefined;
  act(() => {
    starting = result.current.start();
    result.current.stop();
  });
  finishPreparing();
  await act(async () => {
    await starting;
  });

  expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
    interruptionMode: "mixWithOthers",
    playsInSilentMode: false,
    shouldPlayInBackground: false,
  });
  expect(mockPlayer.play).not.toHaveBeenCalled();
});

test("効果音は先頭へ戻してから再生する", async () => {
  const { result } = renderHook(() => useSoundEffect(1, 0.6));

  await act(async () => {
    await result.current();
  });

  expect(mockPlayer.volume).toBe(0.6);
  expect(mockUseAudioPlayer).toHaveBeenCalledWith(1);
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test("BGMはループし、停止時に一時停止して先頭へ戻す", async () => {
  const { result } = renderHook(() => useLoopingAudio(2, 0.2));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    result.current.stop();
    await Promise.resolve();
  });

  expect(mockPlayer.loop).toBe(true);
  expect(mockPlayer.volume).toBe(0.2);
  expect(mockUseAudioPlayer).toHaveBeenCalledWith(2);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
});

test("BGMの停止リセットが終わるまで再開を待つ", async () => {
  let finishReset: () => void = () => undefined;
  mockPlayer.seekTo.mockImplementationOnce(
    () => new Promise<void>((resolve) => (finishReset = resolve)),
  );
  const { result } = renderHook(() => useLoopingAudio(2));

  await act(async () => {
    await result.current.start();
  });
  act(() => result.current.stop());

  let restarting: Promise<void> | undefined;
  act(() => {
    restarting = result.current.start();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);

  finishReset();
  await act(async () => {
    await restarting;
  });
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
});

test("解放済みのBGMプレイヤーを停止しても例外を伝播しない", async () => {
  const releasedError = new Error("Cannot use shared object that was already released");
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const { result, unmount } = renderHook(() => useLoopingAudio(2));
  const stop = result.current.stop;

  unmount();
  mockPlayer.pause.mockImplementationOnce(() => {
    throw releasedError;
  });

  expect(() => stop()).not.toThrow();
  await act(async () => {
    await Promise.resolve();
  });

  expect(warn).toHaveBeenCalledWith("BGMを停止できませんでした", releasedError);
  warn.mockRestore();
});

/** playSoundEffect は待たずに返すので、中の非同期処理が終わるまで待つ */
async function flushSoundEffect() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("操作の効果音は、1音につきプレイヤーを1つだけ作って使い回す", async () => {
  playSoundEffect("confirm");
  await flushSoundEffect();
  playSoundEffect("confirm");
  await flushSoundEffect();

  // 画面のフックではなくアプリ全体で持つので、画面を閉じても音が途切れない
  expect(mockUseAudioPlayer).not.toHaveBeenCalled();
  expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
  expect(mockCreateAudioPlayer).toHaveBeenCalledWith(SOUND_EFFECTS.confirm);
  expect(mockPlayer.volume).toBe(0.8);
  // 連打したときも頭から鳴らし直す
  expect(mockPlayer.seekTo).toHaveBeenCalledTimes(2);
  expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
});

test("別の効果音には別のプレイヤーを作る", async () => {
  playSoundEffect("cancel");
  await flushSoundEffect();

  expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
  expect(mockCreateAudioPlayer).toHaveBeenCalledWith(SOUND_EFFECTS.cancel);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});

test("効果音を鳴らせなくても例外を投げない", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockPlayer.seekTo.mockImplementationOnce(() => Promise.reject(new Error("再生できない")));

  expect(() => playSoundEffect("talk")).not.toThrow();
  await flushSoundEffect();

  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith("効果音を再生できませんでした", expect.any(Error));
  warn.mockRestore();
});
