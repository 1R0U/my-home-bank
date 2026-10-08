import { setAudioModeAsync, useAudioPlayer, type AudioSource } from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

export const AUDIO_SOURCES = {
  purchaseSuccess: require("../assets/audio/purchase-success.mp3"),
  // 我が家タウンのBGMは2曲を交互に流す（Issue #393）。rpgHubBgm1/2 は useTownBgm が使う。
  questBgm: require("../assets/audio/quest-bgm.mp3"),
  rpgHubBgm1: require("../assets/audio/rpg-hub-bgm-1.mp3"),
  rpgHubBgm2: require("../assets/audio/rpg-hub-bgm-2.mp3"),
  storeBgm: require("../assets/audio/store-bgm.mp3"),
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
  const player = useAudioPlayer(source);

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
  const player = useAudioPlayer(source);
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
    try {
      player.pause();
    } catch (error) {
      // フォーカス中のアンマウントでは、先にplayerが解放されていることがある。
      console.warn("BGMを停止できませんでした", error);
    }
    resetPromiseRef.current = resetPromiseRef.current
      .catch(() => undefined)
      .then(() => player.seekTo(0))
      .catch((error) => {
        console.warn("BGMを先頭に戻せませんでした", error);
      });
  }, [player]);

  return { start, stop };
}

/** 我が家タウンのBGMを交互に流す間隔（Issue #393）。「5分くらいで切り替える」という指定。 */
const TOWN_BGM_ROTATE_MS = 5 * 60 * 1000;

/**
 * 我が家タウンのBGMを2曲、約5分おきに交互に流す（Issue #393）。
 *
 * `useLoopingAudio` と同じ考え方（画面のフォーカスに合わせて開始・停止、連打・連続操作の
 * 競合は世代カウンタで防ぐ）だが、2つのプレイヤーを切り替える分岐があるため別関数にする。
 * クロスフェードはせず、今の曲を止めて次の曲を頭から再生する単純な切り替え（最初のバージョンのため）。
 * @param rotateMs - 切り替え間隔。テストから短い値を渡せるよう引数にしてある（既定は5分）
 */
export function useTownBgm(
  sourceA: AudioSource,
  sourceB: AudioSource,
  volume = 0.25,
  rotateMs = TOWN_BGM_ROTATE_MS,
) {
  const playerA = useAudioPlayer(sourceA);
  const playerB = useAudioPlayer(sourceB);
  const activeRef = useRef<"a" | "b">("a");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestGenerationRef = useRef(0);
  const resetPromiseRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    playerA.loop = true;
    playerA.volume = volume;
    playerB.loop = true;
    playerB.volume = volume;
  }, [playerA, playerB, volume]);

  const activePlayer = () => (activeRef.current === "a" ? playerA : playerB);

  const start = useCallback(async () => {
    const requestGeneration = ++requestGenerationRef.current;
    try {
      await prepareAudio();
      await resetPromiseRef.current;
      // 初期化またはリセットを待っている間に画面を離れた場合、遅れて再生を始めない。
      if (requestGeneration !== requestGenerationRef.current) return;
      activePlayer().play();
      timerRef.current = setInterval(() => {
        const finished = activePlayer();
        finished.pause();
        finished.seekTo(0).catch(() => undefined);
        activeRef.current = activeRef.current === "a" ? "b" : "a";
        activePlayer().play();
      }, rotateMs);
    } catch (error) {
      console.warn("BGMを再生できませんでした", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerA, playerB, rotateMs]);

  const stop = useCallback(() => {
    requestGenerationRef.current += 1;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      activePlayer().pause();
    } catch (error) {
      // フォーカス中のアンマウントでは、先にplayerが解放されていることがある。
      console.warn("BGMを停止できませんでした", error);
    }
    resetPromiseRef.current = resetPromiseRef.current
      .catch(() => undefined)
      .then(() => activePlayer().seekTo(0))
      .catch((error) => {
        console.warn("BGMを先頭に戻せませんでした", error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerA, playerB]);

  return { start, stop };
}
