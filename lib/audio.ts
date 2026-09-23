import { setAudioModeAsync, useAudioPlayer, type AudioSource } from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

export const AUDIO_SOURCES = {
  purchaseSuccess: require("../assets/audio/purchase-success.mp3"),
  rpgHubBgm: require("../assets/audio/rpg-hub-bgm.mp3"),
} as const;

let audioModePromise: Promise<void> | null = null;

/**
 * アプリ共通の再生方針を、最初に音を鳴らす直前に一度だけ設定する。
 *
 * - 端末のマナーモードを尊重する
 * - 他アプリの音を止めない
 * - バックグラウンドでは再生しない
 */
function prepareAudio() {
  if (!audioModePromise) {
    audioModePromise = setAudioModeAsync({
      interruptionMode: "mixWithOthers",
      playsInSilentMode: false,
      shouldPlayInBackground: false,
    }).catch((error) => {
      // 一時的な初期化失敗なら、次の再生操作で再試行できるようにする。
      audioModePromise = null;
      throw error;
    });
  }
  return audioModePromise;
}

/** 短い効果音を、必要な画面から1関数で鳴らす。 */
export function useSoundEffect(source: AudioSource, volume = 0.8) {
  const player = useAudioPlayer(source, { downloadFirst: true });

  useEffect(() => {
    player.volume = volume;
  }, [player, volume]);

  return useCallback(async () => {
    try {
      await prepareAudio();
      await player.seekTo(0);
      player.play();
    } catch (error) {
      // 音は補助的なフィードバックなので、再生失敗で本来の操作を失敗扱いにしない。
      console.warn("効果音を再生できませんでした", error);
    }
  }, [player]);
}

/** 画面のフォーカスに合わせて開始・停止するループBGMを作る。 */
export function useLoopingAudio(source: AudioSource, volume = 0.25) {
  const player = useAudioPlayer(source, { downloadFirst: true });
  const requestGenerationRef = useRef(0);
  const resetPromiseRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    player.loop = true;
    player.volume = volume;
  }, [player, volume]);

  const start = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current;
    try {
      await prepareAudio();
      await resetPromiseRef.current;
      // 初期化またはリセットを待っている間に画面を離れた場合、遅れて再生を始めない。
      if (requestGeneration !== requestGenerationRef.current) return;
      player.play();
    } catch (error) {
      console.warn("BGMを再生できませんでした", error);
    }
  }, [player]);

  const stop = useCallback(() => {
    requestGenerationRef.current += 1;
    player.pause();
    resetPromiseRef.current = resetPromiseRef.current
      .catch(() => undefined)
      .then(() => player.seekTo(0))
      .catch((error) => {
        console.warn("BGMを先頭に戻せませんでした", error);
      });
  }, [player]);

  return { start, stop };
}
