import { fetchGuildTreasury } from "./treasuryService";
import { useResource } from "./useResource";
import { fetchUserFamilyId } from "./userService";
import { isUuid } from "./uuid";
import type { GuildTreasury } from "../types";

/**
 * ギルド金庫カードの表示状態（Issue #233）。
 *
 * - `loading`: 取得中、またはまだ取得していない
 * - `loaded`: 取得できた（`treasury` に値が入る）
 * - `no_family`: ログイン中のユーザーが家族に未所属
 * - `not_created`: `guild_treasuries` に行が見つからなかった。
 *   **「本当に未作成」と「行はあるがRLSで見えない」を区別できない。**
 *   Supabase Auth導入後（Issue #24 / #240）は、ログイン中だけ取得する。
 *   それでもDBの所属・ポリシーが不整合な場合は行が見えない可能性があるため、
 *   この状態だけで「金庫が未作成」とは断定しない。
 * - `error`: 取得に失敗した
 * - `unavailable`: 非ライブ（プレビュー中）や非UUIDのモックIDで、そもそも取得できない
 */
export type GuildTreasuryStatus =
  | "loading"
  | "loaded"
  | "no_family"
  | "not_created"
  | "error"
  | "unavailable";

// statusが"loaded"のときだけtreasuryが非nullであることを型で保証する。
// 呼び出し側は status === "loaded" の分岐だけでtreasuryを安全に扱える
export type UseGuildTreasuryResult = { reload: () => Promise<void> } & (
  | { status: "loaded"; treasury: GuildTreasury }
  | { status: Exclude<GuildTreasuryStatus, "loaded">; treasury: null }
);

type TreasuryLookup =
  | { status: "loaded"; treasury: GuildTreasury }
  | { status: "no_family" | "not_created"; treasury: null };

/**
 * 親個人の所持ゴルとは別に、家庭共有のギルド金庫残高を取得する。
 *
 * 利用者ごとのキーで持つので（lib/useResource.ts）、別のユーザーの結果は表示しない。
 * 非ライブ時と、非UUIDのモックIDのときは呼びに行かない（#174と同じ理由）。
 * 他タブでの操作（ゴル発行など）を反映するため、画面へ戻るたびに古ければ取り直す。
 *
 * 取得に失敗した場合、呼び出し側は個人の所持ゴルを金庫残高として代替表示しないこと
 * （`status === "error"` のときは `treasury` は必ず null）。
 * @param userId - 表示中の親ユーザーのID。未ログイン時は undefined
 * @param isLive - 実データに接続しているか
 */
export function useGuildTreasury(
  userId: string | undefined,
  isLive: boolean,
): UseGuildTreasuryResult {
  const { data, error, hasData, reload } = useResource<TreasuryLookup | null>({
    errorMessage: "ギルド金庫残高の取得に失敗しました",
    fetcher: async () => {
      const familyId = await fetchUserFamilyId(userId);
      if (!familyId) return { status: "no_family", treasury: null };
      const treasury = await fetchGuildTreasury(familyId);
      return treasury ? { status: "loaded", treasury } : { status: "not_created", treasury: null };
    },
    initialData: null,
    key: isLive && userId && isUuid(userId) ? ["guildTreasury", userId] : null,
  });

  if (!isLive || !userId || !isUuid(userId)) return { reload, status: "unavailable", treasury: null };
  if (error !== null) return { reload, status: "error", treasury: null };
  if (!hasData || data === null) return { reload, status: "loading", treasury: null };
  if (data.status === "loaded") return { reload, status: "loaded", treasury: data.treasury };
  return { reload, status: data.status, treasury: null };
}
