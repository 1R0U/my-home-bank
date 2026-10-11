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
 *
 * **判定は関数名の付け方だけに頼っている。** `list_` / `is_` など別の接頭辞の読み取りRPCを
 * 足すと、それを呼ぶ画面のフォーカスのたびに番号が増え、全画面で取得の省略が静かに効かなく
 * なる（安全側に倒れるが、誰も気づけない）。読み取り専用のRPCは `get_` / `current_` で始める
 * ことを AGENTS.md の「DBの構造変更」にルールとして書いている。
 */
const READ_ONLY_RPC = /\/rest\/v1\/rpc\/(get_|current_)/;

/**
 * 書き込みはするが、ほかの画面の表示には関係しない RPC。書き込みとして数えない。
 *
 * - `record_app_open`：アプリを開いた日を残す（大人の連続記録。Issue #355）。前面に戻るたびに呼ぶので、
 *   数えると親が前面に戻るたびに番号が増え、どの画面でもフォーカス時の取得を省けなくなる（Issue #243 が効かない）。
 *   これで変わるのは掲示板の連続記録だけで、掲示板は記録が終わったときに自分で取り直している（`onAppOpenRecorded`）。
 *
 * 実際に書き込むので、名前を `get_` にはできない。足すときは、ほかの画面の表示が本当に変わらないかを確かめる。
 */
const DISPLAY_NEUTRAL_WRITE_RPCS: readonly string[] = ["record_app_open"];

/** URL が `DISPLAY_NEUTRAL_WRITE_RPCS` の RPC か（名前の一部だけ一致するものは含めない） */
function isDisplayNeutralWriteRpc(url: string): boolean {
  const match = /\/rest\/v1\/rpc\/([A-Za-z0-9_]+)(?:[?#/]|$)/.exec(url);
  return match !== null && DISPLAY_NEUTRAL_WRITE_RPCS.includes(match[1]);
}

/**
 * Supabase への要求が、データを変えうる書き込みかを判定する。
 *
 * GET / HEAD 以外（POST / PATCH / DELETE など）を書き込みとして扱う。
 * RPC は読み取りでも POST になるため、読み取りだけの RPC（`READ_ONLY_RPC`）は除く。
 * 書き込みでも、ほかの画面の表示に関係しない RPC（`DISPLAY_NEUTRAL_WRITE_RPCS`）は除く。
 * 判断に迷うもの（認証・ストレージなど）は書き込みに倒す。余計に1回取り直すだけで、
 * 反映が遅れるよりは安全なため。
 *
 * @param method - HTTP メソッド（省略時は GET）
 * @param url - 要求先の URL
 */
export function isWriteRequest(method: string | undefined, url: string): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  if (normalized === "GET" || normalized === "HEAD") return false;
  return !READ_ONLY_RPC.test(url) && !isDisplayNeutralWriteRpc(url);
}

type Fetch = typeof fetch;

/**
 * 書き込みの要求の前後で `markDataChanged` を呼ぶ fetch を作る。
 *
 * - **送る前**：応答を待つ間に別のタブへ移ったとき、移った先で取り直させるため。
 *   後ろだけだと、承認ボタンを押してすぐタブを移ると番号がまだ変わっておらず、
 *   移った先の取得が省かれて古い表示のまま残る（PR #391 のレビュー）。
 * - **終わった後**：書き込みが終わったあとの次のフォーカスでも取り直させるため。
 *   送る前の印で取り直した時点では、まだ書き込みが反映されていないことがある。
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

    markDataChanged();
    try {
      return await baseFetch(input, init);
    } finally {
      markDataChanged();
    }
  };
}
