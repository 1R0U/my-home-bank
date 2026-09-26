import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

/** フォーカス時に走らせる処理の戻り値。後始末が要る場合だけ関数を返す。 */
type RefetchResult = void | (() => void) | Promise<unknown>;

/**
 * 画面がフォーカスされるたびに再取得を走らせる（Issue #204）。
 *
 * 大人用画面のタブ化（#173）で、画面はpushされるたびにマウントされるのではなく
 * タブの裏で生存し続けるようになった。そのため `useEffect` だけでは、他タブでの
 * 操作（クエスト承認・購入・ゴル発行など）による変化がフォーカス復帰時に反映されない。
 *
 * 同じ `useFocusEffect(useCallback(...))` の形が複数のフック・画面へ個別に
 * 書かれていたため、ここへ寄せる。フォーカス再取得の仕様（デバウンスや
 * 一定時間内のスキップなど）を変えるときは、この1箇所を直せば全てに効く。
 *
 * タブを持たない画面では、従来どおりマウント時の1回だけ実行される。
 *
 * @param reload - フォーカス時に走らせる処理。**呼び出し側で `useCallback` に
 *   包むこと。** 毎レンダーで識別子が変わると、そのたびに再取得が走る。
 *   後始末が要る場合はクリーンアップ関数を返せる（`useFocusEffect` と同じ）。
 */
export function useRefetchOnFocus(reload: () => RefetchResult) {
  useFocusEffect(
    useCallback(() => {
      const result = reload();

      // async な reload は Promise を返す。そのまま `useFocusEffect` へ返すと
      // 後始末の関数として扱われてしまうため、関数のときだけ通す。
      return typeof result === "function" ? result : undefined;
    }, [reload]),
  );
}
