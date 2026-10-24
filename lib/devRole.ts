import { shouldMeasureHubPerf } from "./rpg-hub/perfStats";

export type DevRole = "parent" | "child";

const rawDevRole = process.env.EXPO_PUBLIC_DEV_ROLE;

/**
 * `npm run start:parent` / `start:child` が EXPO_PUBLIC_DEV_ROLE をセットすると、
 * 開発ビルド（__DEV__）でのみログイン画面を経由せず、指定ロールのホームを直接開ける。
 * 通常の `npm start` / 本番ビルドでは undefined になり、実際のログイン状態がそのまま使われる。
 *
 * このとき使うユーザーは `lib/guestUsers.ts` のゲスト（Supabase にも同じIDをseed済み）。
 * Authセッションは持たないため、実データは読み書きせず画面表示だけを確認する（Issue #211）。
 */
export const DEV_ROLE_OVERRIDE: DevRole | undefined =
  __DEV__ && (rawDevRole === "parent" || rawDevRole === "child")
    ? rawDevRole
    : undefined;

/**
 * 我が家タウンの描画負荷（FPSなど）を計測・表示するか（Issue #507）。
 * `npm run start:perf` が `EXPO_PUBLIC_SHOW_PERF=1` を付けて起動したときだけ true（本番ビルドでは常に false）。
 *
 * `DEV_ROLE_OVERRIDE` と同じく、読み込み時に1回だけ判定する。
 * 判定の中身は `lib/rpg-hub/perfStats.ts` に置いてあるが、この定数はそこに置かない
 * （perfStats.ts は WebView のシーンにもバンドルされ、そこには `__DEV__` が無いため）。
 */
export const SHOW_HUB_PERF = shouldMeasureHubPerf(__DEV__, process.env.EXPO_PUBLIC_SHOW_PERF);
