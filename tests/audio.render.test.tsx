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

jest.mock("expo-audio", () => ({
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
  useAudioPlayer: () => mockPlayer,
}));

import { useLoopingAudio, useSoundEffect } from "../lib/audio";

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
