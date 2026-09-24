/**
 * UUID 文字列かどうかの判定ユーティリティ。
 *
 * 開発用クイックログイン（「大人として入る」等）では store.user が
 * "user-parent-1" のような非UUIDのモックIDになる。一方 Supabase の
 * users.id は uuid 型なので、そのIDで実APIを叩くと必ずエラーになる。
 * 実データ取得を行う前に、IDがUUID形式かどうかでガードするために使う。
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
