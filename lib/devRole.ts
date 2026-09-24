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
