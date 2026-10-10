import { setAudioModeAsync, useAudioPlayer, type AudioSource } from "expo-audio";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

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

/**
 * 1プレイヤー分の再生ライフサイクル（loop/volume設定・世代カウンタによる競合防止・
 * 巻き戻し待ち）を管理する内部ヘルパー。`useLoopingAudio` と `useTownBgm` の両方が使う
 * （1R0Uさんレビュー指摘：以前は2箇所にほぼ同じコードが書かれていた）。
 *
 * `source` を省略すると何も読み込まず待機するプレイヤーになる。`ensureSource` で
 * 後から読み込ませられる（`useTownBgm` の2曲目を、実際に流すまで読み込ませないため）。
 */
function usePlayerLifecycle(source: AudioSource | undefined, volume: number) {
  const player = useAudioPlayer(source);
  const loadedSourceRef = useRef(source);
  const requestGenerationRef = useRef(0);
  const resetPromiseRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    player.loop = true;
    player.volume = volume;
  }, [player, volume]);

  const ensureSource = useCallback(
    (nextSource: AudioSource) => {
      if (loadedSourceRef.current === nextSource) return;
      player.replace(nextSource);
      player.loop = true;
      player.volume = volume;
      loadedSourceRef.current = nextSource;
    },
    [player, volume],
  );

  const play = useCallback(async () => {
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

  /** 完全に停止し、次に再生するときは先頭から始める（画面を離れるときなど）。 */
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

  /** 位置を保ったまま一時停止する（アプリがバックグラウンドに回ったときなど）。 */
  const pauseWithoutReset = useCallback(() => {
    // stop()と同様に世代を進め、一時停止を待っている間に届いたplay()を無効にする
    // （CodeRabbitレビュー指摘：進めないと、バックグラウンド中にplay()の待機が
    // 解決して再生が始まってしまうことがあった）。
    requestGenerationRef.current += 1;
    try {
      player.pause();
    } catch (error) {
      console.warn("BGMを一時停止できませんでした", error);
    }
  }, [player]);

  return { ensureSource, pauseWithoutReset, play, stop };
}

/** 画面のフォーカスに合わせて開始・停止するループBGMを作る。 */
export function useLoopingAudio(source: AudioSource, volume = 0.25) {
  const { play, stop } = usePlayerLifecycle(source, volume);
  return { start: play, stop };
}

/** 我が家タウンのBGMを交互に流す間隔（Issue #393）。「5分くらいで切り替える」という指定。 */
const TOWN_BGM_ROTATE_MS = 5 * 60 * 1000;

/**
 * 我が家タウンのBGMを2曲、約5分おきに交互に流す（Issue #393）。
 *
 * - 1曲目は最初から読み込むが、2曲目は実際に切り替わる直前まで読み込まない
 *   （1R0Uさんレビュー指摘：町に5分以上いないことが多く、読み込んでも鳴らさずに
 *   捨てることが多いため）。
 * - 「5分おき」はフォーカスして実際に鳴っていた時間の積算で数える。町とクエスト/ストアを
 *   数分おきに行き来しても、タイマーが毎回0から数え直しにはならない（1R0Uさんレビュー指摘）。
 * - アプリがバックグラウンドに回っている間はタイマーを止め、再生中の曲を位置を保ったまま
 *   一時停止する。前面に戻ったとき（画面がまだフォーカス中なら）残り時間から再開する
 *   （1R0Uさんレビュー指摘：バックグラウンドでも鳴り続け、復帰時に2曲が重なることがあった）。
 * - 画面を離れて戻ったときは、直前に鳴っていた曲の続きから再生する（`activeRef` は
 *   `stop()` でも戻さない）。クロスフェードはせず、切り替え時は前の曲を止めてから
 *   次の曲を頭から再生する単純な切り替え（最初のバージョンのため）。
 * @param rotateMs - 切り替え間隔。テストから短い値を渡せるよう引数にしてある（既定は5分）
 */
export function useTownBgm(
  sourceA: AudioSource,
  sourceB: AudioSource,
  volume = 0.25,
  rotateMs = TOWN_BGM_ROTATE_MS,
) {
  const trackA = usePlayerLifecycle(sourceA, volume);
  const trackB = usePlayerLifecycle(undefined, volume);
  // 2曲ぶんのコールバックをrefに保持し、下のuseCallback群の依存配列を安定させる
  // （`trackA`/`trackB` はレンダーごとに新しいオブジェクトになるため）。
  const trackARef = useRef(trackA);
  trackARef.current = trackA;
  const trackBRef = useRef(trackB);
  trackBRef.current = trackB;

  const activeRef = useRef<"a" | "b">("a");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 現在の曲へ切り替わってから実際に鳴っていた時間の積算（バックグラウンド・画面離脱中は進まない）。
  const elapsedRef = useRef(0);
  const resumedAtRef = useRef<number | null>(null);
  const isFocusedRef = useRef(false);
  const isForegroundRef = useRef(AppState.currentState === "active");

  const activeTrack = useCallback(
    () => (activeRef.current === "a" ? trackARef.current : trackBRef.current),
    [],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 鳴っていた分だけ経過時間を確定し、タイマーを止める。 */
  const pauseProgress = useCallback(() => {
    clearTimer();
    if (resumedAtRef.current != null) {
      elapsedRef.current += Date.now() - resumedAtRef.current;
      resumedAtRef.current = null;
    }
  }, [clearTimer]);

  const scheduleSwitch = useCallback(
    (delayMs: number) => {
      clearTimer();
      resumedAtRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const finishing = activeTrack();
            finishing.stop();
            activeRef.current = activeRef.current === "a" ? "b" : "a";
            elapsedRef.current = 0;
            resumedAtRef.current = null;
            const next = activeTrack();
            next.ensureSource(activeRef.current === "a" ? sourceA : sourceB);
            await next.play();
            if (isFocusedRef.current && isForegroundRef.current) {
              scheduleSwitch(rotateMs);
            }
          } catch (error) {
            console.warn("BGMを切り替えられませんでした", error);
          }
        })();
      }, Math.max(delayMs, 0));
    },
    [activeTrack, clearTimer, rotateMs, sourceA, sourceB],
  );

  const resumePlayback = useCallback(async () => {
    resumedAtRef.current = Date.now();
    await activeTrack().play();
    // play()を待っている間に画面を離れる／バックグラウンドに回ると、isFocusedRef・
    // isForegroundRefがfalseになる。その場合はタイマーを作らない（1R0Uさんレビュー
    // 指摘：作ってしまうと、別の画面やバックグラウンドで町BGMが鳴り出す）。
    if (!isFocusedRef.current || !isForegroundRef.current) return;
    scheduleSwitch(Math.max(rotateMs - elapsedRef.current, 0));
  }, [activeTrack, rotateMs, scheduleSwitch]);

  const start = useCallback(async () => {
    isFocusedRef.current = true;
    // バックグラウンド中は何もしない。前面に戻ったときのAppStateハンドラが再開する。
    if (!isForegroundRef.current) return;
    await resumePlayback();
  }, [resumePlayback]);

  const stop = useCallback(() => {
    isFocusedRef.current = false;
    pauseProgress();
    activeTrack().stop();
  }, [activeTrack, pauseProgress]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const goingForeground = nextState === "active";
      if (goingForeground === isForegroundRef.current) return;
      isForegroundRef.current = goingForeground;
      if (!isFocusedRef.current) return; // 画面を開いていないときは何もしない
      if (goingForeground) {
        void resumePlayback();
      } else {
        pauseProgress();
        activeTrack().pauseWithoutReset();
      }
    });
    return () => subscription.remove();
  }, [activeTrack, pauseProgress, resumePlayback]);

  return { start, stop };
}
