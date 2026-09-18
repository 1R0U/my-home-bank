import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { createStaleGuard } from "./staleGuard";
import { fetchGuildTreasury } from "./treasuryService";
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
 *   このアプリは現状Supabase Authでサインインしておらず anon ロールで
 *   問い合わせるため、`to authenticated` なRLSポリシーの対象外になり
 *   0件になるケースがある（DB側の対応は本Issueのスコープ外）
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

/**
 * 親個人の所持ポイントとは別に、家庭共有のギルド金庫残高を取得する。
 *
 * `useLiveBalance` と同じ形の設計にしている。
 * 1. **古い応答で上書きしない。** 連続して取り直したとき、先に始まったリクエストが
 *    後から完了しても捨てる（`staleGuard`）
 * 2. **別のユーザーの結果を表示しない。** 取得結果に `userId` を紐付け、いま表示している
 *    ユーザーと一致するときだけ返す
 * 3. **実APIを叩いてよいかの判定。** 非ライブ時と、非UUIDのモックIDのときは呼びに行かない
 * 4. **フォーカス復帰時の再取得。** タブから戻るたびに再取得し、最新の金庫残高を反映する
 *
 * 取得に失敗した場合、呼び出し側は個人の所持ポイントを金庫残高として代替表示しないこと
 * （`status === "error"` のときは `treasury` は必ず null）。
 * @param userId - 表示中の親ユーザーのID。未ログイン時は undefined
 * @param isLive - 実データに接続しているか
 */
export function useGuildTreasury(
  userId: string | undefined,
  isLive: boolean,
): UseGuildTreasuryResult {
  const [result, setResult] = useState<
    | { status: "loaded"; treasury: GuildTreasury; userId: string }
    | { status: Exclude<GuildTreasuryStatus, "loaded">; treasury: null; userId: string }
    | null
  >(null);
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();
    const targetUserId = userId;

    // 非ライブ、または非UUIDのモックIDのときは実APIを叩かない（#174と同じ理由）。
    if (!isLive || !targetUserId || !isUuid(targetUserId)) {
      if (guardRef.current.isCurrent(requestId)) setResult(null);
      return Promise.resolve();
    }

    return fetchUserFamilyId(targetUserId)
      .then((familyId) => {
        // ここでも確認する。ユーザー切替後にAの取得が遅れて解決した場合、
        // 結果はどのみち捨てるので、2ホップ目（金庫取得）を無駄に呼ばずに済む
        if (!guardRef.current.isCurrent(requestId)) return;

        if (!familyId) {
          setResult({ status: "no_family", treasury: null, userId: targetUserId });
          return;
        }

        return fetchGuildTreasury(familyId).then((treasury) => {
          if (!guardRef.current.isCurrent(requestId)) return;

          if (treasury) {
            setResult({ status: "loaded", treasury, userId: targetUserId });
          } else {
            setResult({ status: "not_created", treasury: null, userId: targetUserId });
          }
        });
      })
      .catch((e: unknown) => {
        console.warn("ギルド金庫残高の取得に失敗しました", e);
        if (guardRef.current.isCurrent(requestId)) {
          setResult({ status: "error", treasury: null, userId: targetUserId });
        }
      });
  }, [isLive, userId]);

  // タブ化された画面は生存し続けるため、単なるuseEffectでは他タブでの操作
  // （HMC発行など）による金庫残高の変化がフォーカス復帰時に反映されない。
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (result === null || !isLive || result.userId !== userId) {
    const status: Exclude<GuildTreasuryStatus, "loaded"> =
      userId && isLive && isUuid(userId) ? "loading" : "unavailable";
    return { reload, status, treasury: null };
  }

  if (result.status === "loaded") {
    return { reload, status: "loaded", treasury: result.treasury };
  }
  return { reload, status: result.status, treasury: null };
}
