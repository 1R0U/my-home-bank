/**
 * 手書きのアプリの型（types/index.ts）が、DBの実物（types/database.generated.ts）と
 * ずれていないかを型チェックで確かめる（Issue #399）。
 *
 * このファイルは何も実行しない。`npx tsc --noEmit` がここで失敗したら、手書きの型と
 * DBの列がずれている（改名・削除・型の変更）。どちらが正しいかを確かめて直す。
 *
 * **テーブルの行として扱う型を types/index.ts に足したら、ここにも1行足す。**
 * 足し忘れても型チェックは通るが、その型だけずれの検知から外れる。
 *
 * 判定の内容:
 * - 手書きの型の項目は、すべてDBに同じ名前の列がある（RPCが足す項目は `Extra` で除く）
 * - 手書きの型の値は、DBの列の型に収まる（`status: "open" | ...` のように、DBの `text` を
 *   アプリ側で絞るのはよい）
 *
 * `strict: false`（strictNullChecks 無効）のため、null を許すかどうかの違いは検知できない。
 */
import type { DbRow, DbTables } from "./database.generated";
import type {
  BankAccount,
  EconomyTransaction,
  Family,
  GuildTreasury,
  Loan,
  LoanRepayment,
  Quest,
  QuestLog,
  StoreItem,
  StoreItemRequest,
  TaskReport,
  Transaction,
  User,
} from "./index";

type Check<App, Row, Extra extends keyof App = never> = {
  [K in Exclude<keyof App, Extra>]-?: K extends keyof Row
    ? App[K] extends Row[K]
      ? true
      : ["DBの列と型が違う", K]
    : ["DBに無い列", K];
};

/** すべて true なら true、どれかが違えばその理由になる。 */
type AllMatch<T> = T[keyof T] extends true ? true : Exclude<T[keyof T], true>;

type Compatible<App, Table extends keyof DbTables, Extra extends keyof App = never> = AllMatch<
  Check<App, DbRow<Table>, Extra>
>;

// 型が違うと、ここで「true を ["DBに無い列", "xxx"] に代入できない」というエラーになる。
export const SCHEMA_COMPAT: {
  bankAccount: Compatible<BankAccount, "bank_accounts">;
  economyTransaction: Compatible<EconomyTransaction, "economy_transactions">;
  family: Compatible<Family, "families">;
  guildTreasury: Compatible<GuildTreasury, "guild_treasuries">;
  loan: Compatible<Loan, "loans">;
  loanRepayment: Compatible<LoanRepayment, "loan_repayments">;
  quest: Compatible<Quest, "quests">;
  questLog: Compatible<QuestLog, "quest_logs">;
  storeItem: Compatible<StoreItem, "store_items">;
  storeItemRequest: Compatible<StoreItemRequest, "store_item_requests">;
  taskReport: Compatible<TaskReport, "task_reports">;
  transaction: Compatible<Transaction, "transactions">;
  user: Compatible<User, "users">;
} = {
  bankAccount: true,
  economyTransaction: true,
  family: true,
  guildTreasury: true,
  loan: true,
  loanRepayment: true,
  quest: true,
  questLog: true,
  storeItem: true,
  storeItemRequest: true,
  taskReport: true,
  transaction: true,
  user: true,
};
