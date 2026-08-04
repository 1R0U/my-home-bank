export type DevRole = "parent" | "child";

const rawDevRole = process.env.EXPO_PUBLIC_DEV_ROLE;

/**
 * `npm run start:parent` / `start:child` などで EXPO_PUBLIC_DEV_ROLE をセットすると、
 * 開発ビルド（__DEV__）でのみ実際のログインを無視してロールを固定できる。
 * 通常の `npm start` / 本番ビルドでは undefined になり、実際のログイン状態がそのまま使われる。
 */
export const DEV_ROLE_OVERRIDE: DevRole | undefined =
  __DEV__ && (rawDevRole === "parent" || rawDevRole === "child")
    ? rawDevRole
    : undefined;
