import type { User, UserRole } from "../types";

/**
 * 開発用のゲストユーザー（Issue #211）。
 *
 * `npm run start:parent` / `start:child` は、ここのユーザーとしてログイン済みの状態で
 * 起動する。実体は Supabase の `users` に seed 済みの行
 * （`supabase/migrations/20260915000000_seed_guest_users.sql`）。
 *
 * **IDはマイグレーションと一致させること。** 片方だけ変えると、存在しないユーザーで
 * ログインした状態になり、取得が全て空になって原因が分かりにくい。
 *
 * モックユーザー（`constants/mockData.ts` の `MOCK_USERS`）との違い:
 * こちらは実在する行なので、IDがUUIDであり、クエスト追加・購入・預入などの
 * 書き込みが実際に通る。モックユーザーは非UUIDのため #174 のガードで弾かれる。
 */

/** 大人ゲストのID。マイグレーションの値と一致させること */
const GUEST_PARENT_ID = "00000000-0000-4000-8000-000000000001";

/** 子供ゲストのID。マイグレーションの値と一致させること */
const GUEST_CHILD_ID = "00000000-0000-4000-8000-000000000002";

/**
 * ここの `balance` と `created_at` は、実データを取得するまでの初期表示にしか使わない。
 * 画面に出る値は Supabase から取り直したものに置き換わるため、seed 時の値と
 * ずれていても問題ない（ずれるのは、ゲストで残高を動かした後の再起動時）。
 */
export const GUEST_USERS: Record<UserRole, User> = {
  parent: {
    id: GUEST_PARENT_ID,
    name: "ゲスト（大人）",
    role: "parent",
    balance: 1000,
    created_at: "2026-09-15T00:00:00Z",
  },
  child: {
    id: GUEST_CHILD_ID,
    name: "ゲスト（子供）",
    role: "child",
    balance: 500,
    created_at: "2026-09-15T00:00:00Z",
  },
};

/**
 * ロールに対応するゲストユーザーを返す。
 * @param role - 大人か子供か
 * @returns ゲストユーザー
 */
export function getGuestUser(role: UserRole): User {
  return GUEST_USERS[role];
}
