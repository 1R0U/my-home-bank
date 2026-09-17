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
 * - `not_created`: 家族はあるが、まだ金庫が作られていない
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

export type UseGuildTreasuryResult = {
  treasury: GuildTreasury | null;
  status: GuildTreasuryStatus;
  reload: () => Promise<void>;
};

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
    { status: GuildTreasuryStatus; treasury: GuildTreasury | null; userId: string } | null
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
        if (!familyId) {
          if (guardRef.current.isCurrent(requestId)) {
            setResult({ status: "no_family", treasury: null, userId: targetUserId });
          }
          return;
        }

        return fetchGuildTreasury(familyId).then((treasury) => {
          if (guardRef.current.isCurrent(requestId)) {
            setResult({
              status: treasury ? "loaded" : "not_created",
              treasury,
              userId: targetUserId,
            });
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

  const isForCurrentUser = isLive && result !== null && result.userId === userId;
  if (!isForCurrentUser) {
    return { reload, status: userId && isUuid(userId) && isLive ? "loading" : "unavailable", treasury: null };
  }

  return { reload, status: result.status, treasury: result.treasury };
}
