import { useCallback, useEffect, useRef, useState } from "react";
import { createStaleGuard } from "./staleGuard";
import { fetchUserBalance } from "./userService";
import { isUuid } from "./uuid";

/**
 * 画面表示中に所持金を再取得するためのフック（Issue #147）。
 *
 * 同じ処理が ParentHomeScreen / ChildTasksScreen / app/bank.tsx に手書きでコピーされており、
 * **ユーザー切替時の対策が ParentHomeScreen にしか入っていなかった**ため共通化した。
 *
 * ここが引き受けるのは次の3つ。
 *
 * 1. **古い応答で上書きしない。** 連続して取り直したとき、先に始まったリクエストが後から
 *    完了しても捨てる（`staleGuard`）
 * 2. **別のユーザーの残高を表示しない。** 取得結果に `userId` を紐付け、いま表示している
 *    ユーザーと一致するときだけ返す。一致しなければ null を返し、表示側はモック値へ戻る。
 *    ユーザーが切り替わってから再取得が終わるまでの間、前のユーザーの残高が見えるのを防ぐ
 * 3. **実APIを叩いてよいかの判定。** 非ライブ時と、開発用クイックログインで `userId` が
 *    非UUIDのモックIDのときは呼びに行かない（#174）
 */
export type LiveBalance = {
  /**
   * 取得できた残高。次の場合は null になるので、呼び出し側はモック値へフォールバックする。
   * - まだ取得していない / 非ライブ / 非UUIDのモックID
   * - 取得に失敗した
   * - 取得済みの結果が別のユーザーのものだった
   */
  balance: number | null;
  /** 取得に失敗したか。「取れていない」ことを画面に出したい場合に使う */
  hasError: boolean;
  /** 取り直す。完了を待ちたい呼び出し元のために Promise を返す */
  reload: () => Promise<void>;
};

/**
 * 所持金を取得し、ユーザーが切り替わっても前の値を見せないようにする。
 * @param userId - 表示中のユーザーのID。未ログイン時は undefined
 * @param isLive - 実データに接続しているか
 * @returns 残高・エラーの有無・取り直す関数
 */
export function useLiveBalance(userId: string | undefined, isLive: boolean): LiveBalance {
  // 残高とエラーを1つの状態にまとめ、どちらにも同じ userId を紐付ける。
  // 別々に持つと、片方だけ前のユーザーのものが残る組み合わせが作れてしまう。
  const [result, setResult] = useState<
    { balance: number | null; hasError: boolean; userId: string } | null
  >(null);
  const guardRef = useRef(createStaleGuard());

  const reload = useCallback((): Promise<void> => {
    const requestId = guardRef.current.start();
    const targetUserId = userId;

    // 非ライブ、または非UUIDのモックIDのときは実APIを叩かない。
    // 実APIは uuid のパースに失敗するだけなので、呼ばずにモック値へ任せる（#174）。
    if (!isLive || !targetUserId || !isUuid(targetUserId)) {
      if (guardRef.current.isCurrent(requestId)) setResult(null);
      return Promise.resolve();
    }

    return fetchUserBalance(targetUserId)
      .then((balance) => {
        if (guardRef.current.isCurrent(requestId)) {
          setResult({ balance, hasError: false, userId: targetUserId });
        }
      })
      .catch((e: unknown) => {
        // 取得に失敗しても画面自体は表示できるよう、残高はモック値へフォールバックする。
        console.warn("所持金の取得に失敗しました", e);
        if (guardRef.current.isCurrent(requestId)) {
          setResult({ balance: null, hasError: true, userId: targetUserId });
        }
      });
  }, [isLive, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 取得済みの結果が「いま表示しているユーザー」のものである場合だけ採用する。
  const isForCurrentUser = isLive && result !== null && result.userId === userId;

  return {
    balance: isForCurrentUser ? result.balance : null,
    hasError: isForCurrentUser ? result.hasError : false,
    reload,
  };
}
