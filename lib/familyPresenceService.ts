import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

/** 町にいる人の現在位置。 */
export type FamilyTownPosition = { facingY: number; x: number; z: number };

/** Presenceに載せる値。送信時刻を添え、複数端末からの更新でも新しさを判定できるようにする。 */
type FamilyTownPresencePayload = FamilyTownPosition & { updatedAt: number };

/** `subscribeToFamilyTownPresence` が返す、1接続分の操作。 */
export type FamilyTownPresenceSubscription = {
  /** 自分の位置を知らせる（町にいる間だけ呼ぶ）。送信自体は間引く。 */
  setPosition: (position: FamilyTownPosition) => void;
  /** 位置を取り下げる（町を離れたとき）。他の家族の画面からは自分が消える。 */
  clearPosition: () => void;
  /** 購読をやめる（画面を離れる・ログアウトなど）。 */
  stop: () => void;
};

type SubscribeClient = Pick<SupabaseClient, "channel" | "removeChannel">;

/** 初回購読に失敗したときの再試行の間隔（ミリ秒）。この回数だけ試し、最後も失敗したら諦める。 */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

/** 位置の送信（track）を間引く間隔（ミリ秒）。毎秒2〜4回程度に抑える（1R0Uさんレビュー指摘：
 * シーンは移動中100msごとに位置を送るため、間引かないと家族全員の端末で地図の再描画が
 * 毎回起き、Realtimeの回数制限に当たる恐れがある）。 */
const DEFAULT_THROTTLE_MS = 300;

type SubscribeOptions = {
  /** テストから短くできるよう引数にしてある（既定は上記の実運用向けの値）。 */
  retryDelaysMs?: readonly number[];
  throttleMs?: number;
};

/**
 * 同じ家族の「町」にいる人の位置を共有するPresenceチャンネルを購読する（Issue #409）。
 *
 * このアプリで初めてSupabase Realtimeを使う機能。
 *
 * - **送信を間引く。** `setPosition` を呼ぶたびに毎回 `track()` すると回数が多すぎるため、
 *   `throttleMs` 間隔でまとめて送る（最後の値は必ず送る）。
 * - **同じ状態を送り直さない。** 既に取り下げている間は `clearPosition` を呼んでも何もしない。
 * - **再接続時は送り直す。** 一時的な切断から自動で復帰した（再度 `SUBSCRIBED` になった）とき、
 *   直前に送っていた位置を送り直す。復帰後も立ち止まっていると、次の移動まで
 *   `setPosition` が呼ばれず、他の家族の画面に自分の矢印が戻らないため。
 * - **初回の購読に失敗したら、間隔をあけて再試行する。** 電波の悪い環境で画面を開いた
 *   直後の一時的な失敗で、画面に入り直すまで使えなくなることを防ぐ。
 *
 * チャンネルは家族ID（UUID）で分ける。UUIDを知っていれば理論上は参加できてしまうため、
 * 厳密な認可ではない（要確認: Supabase Realtime Authorizationでの非公開チャンネル化）。
 * @param familyId - 自分の家族ID
 * @param userId - 自分のユーザーID（Presenceのkeyにする。自分自身は `onChange` から除く）
 * @param onChange - 他の家族の現在位置（自分以外）が変わるたびに呼ばれる
 * @param client - 差し替え用のクライアント。テスト以外では省略する
 * @param options - 再試行間隔・送信の間引き間隔。テスト以外では省略する
 */
export async function subscribeToFamilyTownPresence(
  familyId: string,
  userId: string,
  onChange: (positions: Record<string, FamilyTownPosition>) => void,
  client?: SubscribeClient,
  options?: SubscribeOptions,
): Promise<FamilyTownPresenceSubscription> {
  const resolvedClient = await resolveClient<SubscribeClient>(client);
  const retryDelays = options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS;
  const channelName = `family-town:${familyId}`;

  let channel: ReturnType<SubscribeClient["channel"]> | null = null;

  const notify = () => {
    if (!channel) return;
    const state = channel.presenceState<FamilyTownPresencePayload>();
    const positions: Record<string, FamilyTownPosition> = {};
    const freshest: Record<string, number> = {};
    for (const [key, entries] of Object.entries(state)) {
      // 自分自身は除く。同じ利用者が複数端末から参加していることもあるため、
      // 並び順（参加順）ではなく送信時刻が最も新しいものを選ぶ（1R0Uさんレビュー指摘）。
      if (key === userId) continue;
      for (const entry of entries) {
        if (freshest[key] === undefined || entry.updatedAt > freshest[key]) {
          freshest[key] = entry.updatedAt;
          positions[key] = { facingY: entry.facingY, x: entry.x, z: entry.z };
        }
      }
    }
    onChange(positions);
  };

  // 間引き・取り下げの重複防止用の状態。
  let trackedState: "cleared" | "tracked" = "cleared";
  let pendingPosition: FamilyTownPosition | null = null;
  let lastSentAt = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    flushTimer = null;
    if (!channel || !pendingPosition) return;
    trackedState = "tracked";
    lastSentAt = Date.now();
    const payload: FamilyTownPresencePayload = { ...pendingPosition, updatedAt: Date.now() };
    channel.track(payload).catch((error: unknown) => {
      console.warn("家族への位置の共有に失敗しました", error);
    });
  };

  /** 再接続後、直前に送っていた位置があれば送り直す（1R0Uさんレビュー指摘）。 */
  const resendIfTracked = () => {
    if (trackedState === "tracked" && pendingPosition) flush();
  };

  const attemptSubscribe = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const nextChannel = resolvedClient.channel(channelName, {
        config: { presence: { key: userId } },
      });
      nextChannel.on("presence", { event: "sync" }, notify);

      let joined = false;
      nextChannel.subscribe((status, error) => {
        if (!joined) {
          if (status === "SUBSCRIBED") {
            joined = true;
            channel = nextChannel;
            resolve();
            return;
          }
          // SUBSCRIBED以外（CHANNEL_ERROR・TIMED_OUT・CLOSED）は、この試行が
          // 成立しなかったものとして扱う。放置するとPromiseが永久に保留され、
          // channelも残り続ける（CodeRabbitレビュー指摘）。
          joined = true;
          resolvedClient.removeChannel(nextChannel).catch(() => undefined);
          reject(error ?? new Error(`家族の位置チャンネルの購読に失敗しました（status: ${status}）`));
          return;
        }
        // 成立した後に起きる状態変化（一時的な切断・自動再接続）。
        if (status === "SUBSCRIBED") resendIfTracked();
      });
    });

  let lastError: unknown;
  let subscribed = false;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await attemptSubscribe();
      subscribed = true;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < retryDelays.length) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      }
    }
  }
  if (!subscribed) throw lastError;

  return {
    clearPosition: () => {
      pendingPosition = null;
      clearFlushTimer();
      // 既に取り下げ済みなら何もしない（1R0Uさんレビュー指摘：屋内にいる間、位置の
      // 更新のたびにuntrackが送られ続けていた）。
      if (trackedState === "cleared") return;
      trackedState = "cleared";
      channel?.untrack().catch((error: unknown) => {
        console.warn("家族への位置の取り下げに失敗しました", error);
      });
    },
    setPosition: (position) => {
      pendingPosition = position;
      const elapsed = Date.now() - lastSentAt;
      if (elapsed >= throttleMs) {
        flush();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, throttleMs - elapsed);
      }
    },
    stop: () => {
      clearFlushTimer();
      if (channel) resolvedClient.removeChannel(channel).catch(() => undefined);
    },
  };
}
