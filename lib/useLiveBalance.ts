import { useResource } from "./useResource";
import { fetchUserBalance } from "./userService";
import { isUuid } from "./uuid";

/**
 * 画面表示中に所持金を取得するフック（Issue #147）。
 *
 * 同じ利用者の所持金は、ホーム・タスク・銀行の各画面で共有する（lib/useResource.ts）。
 * 利用者ごとに別のキーで持つので、切り替え直後に前の利用者の残高が見えることはない。
 * 非ライブ時と、開発用クイックログインで `userId` が非UUIDのモックIDのときは呼びに行かない（#174）。
 */
export type LiveBalance = {
  /**
   * 取得できた残高。次の場合は null になるので、呼び出し側はモック値へフォールバックする。
   * - まだ取得していない / 非ライブ / 非UUIDのモックID
   * - 取得に失敗した
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
  const { data, error, hasData, reload } = useResource<number | null>({
    errorMessage: "所持金の取得に失敗しました",
    fetcher: () => fetchUserBalance(userId),
    initialData: null,
    key: isLive && userId && isUuid(userId) ? ["balance", userId] : null,
  });

  // 失敗したときは、前回取れていた値も使わずモック値へ戻す（従来どおり）
  const hasError = error !== null;
  return { balance: hasData && !hasError ? data : null, hasError, reload };
}
