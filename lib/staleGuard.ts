/**
 * 非同期処理で「後から開始したリクエストの結果だけを反映し、
 * 先に開始して後から完了した古いレスポンスは無視する」ためのガード。
 *
 * 使い方:
 *   const guard = createStaleGuard();
 *   const requestId = guard.start();
 *   const result = await fetchSomething();
 *   if (guard.isCurrent(requestId)) {
 *     // 最新のリクエストの結果である場合のみ反映する
 *     setState(result);
 *   }
 */
export function createStaleGuard() {
  let currentId = 0;

  return {
    /** 新しいリクエストを開始し、そのリクエスト固有のIDを返す。 */
    start(): number {
      currentId += 1;
      return currentId;
    },
    /** 渡されたIDが、直近に開始された（＝最新の）リクエストのものかどうかを返す。 */
    isCurrent(requestId: number): boolean {
      return requestId === currentId;
    },
  };
}
