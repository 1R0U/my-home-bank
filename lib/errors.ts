/**
 * 失敗の種類を固定の名前で表し、成功と失敗を戻り値で返すための型（Issue #188）。
 *
 * 【コードと文言の役割を分ける】
 * ERROR CODE は処理の分岐に使い、文章は表示に使う。
 * 表示文言を変えてもアプリの挙動が変わらないようにするため、
 * メッセージのテキストで分岐しない。
 */

/**
 * アプリが扱う失敗の種類。
 *
 * 種類を追加したときは `describeAppError` の分岐も更新する。
 * 更新を忘れると型チェック（`npx tsc --noEmit`）で失敗する。
 */
export type AppErrorCode =
  /** 入力が仕様に合わない。アプリ側の検証で判明したもの */
  | "INVALID_AMOUNT"
  /** DB側の業務ルールで拒否された（残高不足など） */
  | "OPERATION_REJECTED"
  /** DBの制約に違反した。通常はアプリ側の不具合を示す */
  | "CONSTRAINT_VIOLATION"
  /** サーバーへ届かなかった。読み取りなら、そのまま再試行してよい */
  | "NETWORK_ERROR"
  /** 送信したが結果を確認できない。DB側は成功しているかもしれない */
  | "OUTCOME_UNKNOWN"
  /** 上記のいずれにも当てはまらない */
  | "UNEXPECTED";

/**
 * 失敗の情報。
 *
 * `detail` は調査用で、**画面にそのまま表示しない**。
 * 例外は `OPERATION_REJECTED` で、DBが返す文言は利用者へ見せられる内容のため
 * `describeAppError` が表示に使う。
 */
export type AppError = {
  code: AppErrorCode;
  detail?: {
    /** Supabaseが返した SQLSTATE。通信失敗時は空文字 */
    dbCode: string;
    dbMessage: string;
  };
};

/**
 * 成功した値か、失敗の情報のどちらかを表す。
 *
 * 判別に使う `status` を**文字列**にしているのは、このリポジトリが
 * `strict: false`（`strictNullChecks` が無効）で動いているため。
 * `{ ok: true } | { ok: false }` のような真偽値リテラルの直和型は、
 * この設定では `if (!result.ok)` による絞り込みが効かず、
 * 失敗側の `error` を読もうとすると型エラーになる。
 * 文字列リテラルの判別子なら、同じ設定でも絞り込みが働く。
 */
export type Result<T, E = AppError> =
  | { status: "success"; value: T }
  | { status: "failure"; error: E };

/** 成功のResultを作る。 */
export function ok<T>(value: T): Result<T, never> {
  return { status: "success", value };
}

/** 失敗のResultを作る。 */
export function fail<E>(error: E): Result<never, E> {
  return { status: "failure", error };
}

/**
 * 制約違反を表す SQLSTATE。
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const CONSTRAINT_SQLSTATES = new Set([
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23505", // unique_violation
  "23514", // check_violation
  "23P01", // exclusion_violation
]);

/** `raise exception` が既定で使う SQLSTATE。業務ルールによる拒否を表す。 */
const RAISE_EXCEPTION_SQLSTATE = "P0001";

function readStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "string" ? raw : null;
}

/**
 * Supabaseが返したエラーを、アプリの ERROR CODE へ変換する。
 *
 * 判定には `error.code`（SQLSTATE）を使い、メッセージの部分一致には依存しない。
 * `@supabase/postgrest-js` も「`code` で分岐し、`message` のテキストで分岐するな」としている。
 *
 * **分類できないものを既知の失敗へ寄せない。** 未知のものは `UNEXPECTED` とし、
 * 元の値を `detail` に残して調査できるようにする。
 *
 * @param error - `supabase.rpc()` などが `error` として返した値
 * @param operation - 読み取りか書き込みか。通信が失敗したときの扱いが変わる
 */
export function classifySupabaseError(
  error: unknown,
  operation: "read" | "write",
): AppError {
  const dbCode = readStringField(error, "code");
  const dbMessage = readStringField(error, "message") ?? String(error);

  // code を持たない＝Supabaseのエラーの形をしていない。原因が分からないため UNEXPECTED。
  if (dbCode === null) {
    return { code: "UNEXPECTED", detail: { dbCode: "", dbMessage } };
  }

  const detail = { dbCode, dbMessage };

  // postgrest-js は、サーバーへ届かなかった場合に code を空文字のままにする。
  if (dbCode === "") {
    // 書き込みでは、DB側が処理を終えてから応答が失われた可能性を否定できない。
    // 「通信に失敗した」ことと「DB更新に失敗した」ことは同じではないため、
    // 書き込みは結果不明として扱い、そのままの再送を許さない。
    return { code: operation === "write" ? "OUTCOME_UNKNOWN" : "NETWORK_ERROR", detail };
  }

  if (dbCode === RAISE_EXCEPTION_SQLSTATE) {
    // 現在、銀行RPCの拒否はすべてこのコードになるため、理由までは区別できない。
    // 理由ごとに固有のコードを割り当てるのは Issue #189 で行う。
    return { code: "OPERATION_REJECTED", detail };
  }

  if (CONSTRAINT_SQLSTATES.has(dbCode)) {
    return { code: "CONSTRAINT_VIOLATION", detail };
  }

  return { code: "UNEXPECTED", detail };
}

/**
 * 利用者へ表示する文言を返す。
 *
 * 種類を追加してこの分岐を更新し忘れると、`never` への代入が通らず型チェックで失敗する。
 */
export function describeAppError(error: AppError): string {
  switch (error.code) {
    case "INVALID_AMOUNT":
      return "金額を確認してください。";
    case "OPERATION_REJECTED":
      // DBが返す文言は利用者へ見せられる内容のため、そのまま使う。
      return error.detail?.dbMessage || "この操作は受け付けられませんでした。";
    case "CONSTRAINT_VIOLATION":
      return "保存できない内容でした。入力を確認してください。";
    case "NETWORK_ERROR":
      return "通信に失敗しました。電波の状態を確認して、もう一度お試しください。";
    case "OUTCOME_UNKNOWN":
      return "結果を確認できませんでした。画面を更新して、反映されているか確認してください。";
    case "UNEXPECTED":
      return "問題が発生しました。時間をおいて再度お試しください。";
    default: {
      const unhandled: never = error.code;
      throw new Error(`未対応のERROR CODE: ${String(unhandled)}`);
    }
  }
}

/**
 * そのまま同じ操作をやり直してよいかを返す。
 *
 * `OUTCOME_UNKNOWN` は、DB側が成功しているかもしれないため false。
 * 安全に再送するには操作IDによる重複防止が必要で、それは Issue #190 で扱う。
 */
export function isSafeToRetry(error: AppError): boolean {
  return error.code === "NETWORK_ERROR";
}
