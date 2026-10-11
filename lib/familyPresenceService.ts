import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClient } from "./supabaseClient.ts";

/** 町にいる人の現在位置。 */
export type FamilyTownPosition = { facingY: number; x: number; z: number };

/** `subscribeToFamilyTownPresence` が返す、1接続分の操作。 */
export type FamilyTownPresenceSubscription = {
  /** 自分の位置を知らせる（町にいる間だけ呼ぶ）。 */
  setPosition: (position: FamilyTownPosition) => void;
  /** 位置を取り下げる（町を離れたとき）。他の家族の画面からは自分が消える。 */
  clearPosition: () => void;
  /** 購読をやめる（画面を離れる・ログアウトなど）。 */
  stop: () => void;
};

/**
 * 同じ家族の「町」にいる人の位置を共有するPresenceチャンネルを購読する（Issue #409）。
 *
 * このアプリで初めてSupabase Realtimeを使う機能。切断時は自動で `leave` が起きるため、
 * 「しばらく更新が無ければ消す」ようなタイムアウトを自前で持つ必要がない。
 *
 * チャンネルは家族ID（UUID）で分ける。UUIDを知っていれば理論上は参加できてしまうため、
 * 厳密な認可ではない（要確認: Supabase Realtime Authorizationでの非公開チャンネル化）。
 * @param familyId - 自分の家族ID
 * @param userId - 自分のユーザーID（Presenceのkeyにする。自分自身は `onChange` から除く）
 * @param onChange - 他の家族の現在位置（自分以外）が変わるたびに呼ばれる
 * @param client - 差し替え用のクライアント。テスト以外では省略する
 */
export async function subscribeToFamilyTownPresence(
  familyId: string,
  userId: string,
  onChange: (positions: Record<string, FamilyTownPosition>) => void,
  client?: Pick<SupabaseClient, "channel">,
): Promise<FamilyTownPresenceSubscription> {
  const resolvedClient = await resolveClient<Pick<SupabaseClient, "channel">>(client);
  const channel = resolvedClient.channel(`family-town:${familyId}`, {
    config: { presence: { key: userId } },
  });

  const notify = () => {
    const state = channel.presenceState<FamilyTownPosition>();
    const positions: Record<string, FamilyTownPosition> = {};
    for (const [key, entries] of Object.entries(state)) {
      // 自分自身は除く。同じkeyに複数の接続があれば、最後に同期された分を使う。
      if (key === userId) continue;
      const latest = entries.at(-1);
      if (latest) positions[key] = { facingY: latest.facingY, x: latest.x, z: latest.z };
    }
    onChange(positions);
  };

  channel.on("presence", { event: "sync" }, notify);

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });

  return {
    clearPosition: () => {
      channel.untrack().catch((error: unknown) => {
        console.warn("家族への位置の取り下げに失敗しました", error);
      });
    },
    setPosition: (position) => {
      channel.track(position).catch((error: unknown) => {
        console.warn("家族への位置の共有に失敗しました", error);
      });
    },
    stop: () => {
      channel.unsubscribe().catch((error: unknown) => {
        console.warn("家族の位置チャンネルの解除に失敗しました", error);
      });
    },
  };
}
