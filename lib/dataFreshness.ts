/**
 * サーバー上のデータが「この端末の操作で変わったか」を数える（Issue #243）。
 *
 * フォーカスのたびの再取得（`useRefetchOnFocus`）は、直近に取得してから一定時間内なら
 * 省く。ただし、その間にこの端末で書き込み（クエスト承認・購入・ゴル発行など）があれば、
 * 他のタブの数字も変わりうるので取り直す。その「書き込みがあったか」をここで数える。
 *
 * 書き込みは Supabase クライアントの fetch（`lib/supabase.ts`）で一括して拾う。
 * 更新系の呼び出し元ごとに印を付ける形だと、新しい操作を足したときに付け忘れて
 * 「承認したのに反映されない」に戻るため、通信の層で漏れなく拾う。
 */

let version = 0;

/** この端末からの書き込みのたびに増える番号を返す。 */
export function getDataVersion(): number {
  return version;
}

/** データが変わった（かもしれない）ことを記録する。 */
export function markDataChanged(): void {
  version += 1;
}

/**
 * 読み取りだけの RPC。DB の関数名がこの接頭辞で始まるものは、書き込みとして数えない。
 * 数えてしまうと、再取得そのものが「変化あり」になり、時間内の省略が効かなくなる。
 *
 * 例: `get_loan_offer` / `get_current_store_catalog` / `current_user_family_id`
 */
const READ_ONLY_RPC = /\/rest\/v1\/rpc\/(get_|current_)/;

/**
 * Supabase への要求が、データを変えうる書き込みかを判定する。
 *
 * GET / HEAD 以外（POST / PATCH / DELETE など）を書き込みとして扱う。
 * RPC は読み取りでも POST になるため、読み取りだけの RPC（`READ_ONLY_RPC`）は除く。
 * 判断に迷うもの（認証・ストレージなど）は書き込みに倒す。余計に1回取り直すだけで、
 * 反映が遅れるよりは安全なため。
 *
 * @param method - HTTP メソッド（省略時は GET）
 * @param url - 要求先の URL
 */
export function isWriteRequest(method: string | undefined, url: string): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  if (normalized === "GET" || normalized === "HEAD") return false;
  return !READ_ONLY_RPC.test(url);
}

type Fetch = typeof fetch;

/**
 * 書き込みの要求が終わったときに `markDataChanged` を呼ぶ fetch を作る。
 *
 * 失敗や通信例外でも記録する。結果が分からない書き込み（応答が届かなかった銀行操作など）も
 * サーバー側では反映されているかもしれないため。
 *
 * @param baseFetch - 実際に通信する fetch
 */
export function createChangeTrackingFetch(baseFetch: Fetch): Fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : undefined);
    if (!isWriteRequest(method, url)) return baseFetch(input, init);

    try {
      return await baseFetch(input, init);
    } finally {
      markDataChanged();
    }
  };
}
