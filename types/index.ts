export type UserRole = "parent" | "child";

export type User = {
  id: string;
  family_id?: string | null;
  name: string;
  role: UserRole;
  balance: number;
  created_at: string;
};

export type Family = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type GuildTreasury = {
  id: string;
  family_id: string;
  balance: number;
  initial_supply: number;
  total_supply: number;
  minimum_reserve_rate: number;
  created_at: string;
  updated_at: string;
};

export type EconomyAccountType = "system" | "treasury" | "wallet" | "savings";

export type EconomyTransactionType =
  | "treasury_initialization"
  | "treasury_issue"
  | "quest_reward"
  | "store_purchase"
  | "loan_disburse"
  | "loan_repay_principal"
  | "loan_interest"
  | "savings_auto_transfer"
  | "savings_withdraw"
  | "savings_interest";

export type EconomyTransaction = {
  id: string;
  family_id: string;
  actor_user_id: string | null;
  type: EconomyTransactionType;
  from_account_type: EconomyAccountType;
  from_user_id: string | null;
  to_account_type: EconomyAccountType;
  to_user_id: string | null;
  amount: number;
  description: string;
  related_type: string | null;
  related_id: string | null;
  store_base_price: number | null;
  store_price_index: number | null;
  store_sale_price: number | null;
  idempotency_key: string;
  created_at: string;
};

export type QuestCategory = "daily" | "weekly" | "limited";

export type QuestStatus = "open" | "accepted" | "pending" | "completed";

/** 先着1人・親が指定した1人・子供全員（1人ずつ実施・報酬）。 */
export type QuestAudience = "first" | "specific" | "all";

export type Quest = {
  id: string;
  family_id: string;
  title: string;
  description: string;
  category: QuestCategory;
  // 限定タスクの受付期限。旧データ・プレビューで未指定の場合も期限なしとして扱う。
  expires_at?: string | null;
  /** 最初の実施のID。同じ設定から生まれた期間別・子供別の実施を結ぶ。 */
  recurrence_source_id?: string | null;
  period_starts_at?: string | null;
  period_ends_at?: string | null;
  audience?: QuestAudience;
  /** 親が指定した担当。実際に受注した子を記録するassigned_toとは別。 */
  target_child_id?: string | null;
  /** 日曜日0〜土曜日6。ウィークリーだけに設定する。 */
  week_start_day?: number | null;
  /** デイリーの終了時刻。日本時間の0時からの分数（0〜1439）。開始は24時間前。 */
  daily_end_minutes?: number | null;
  // 必須（毎日必ずやってほしい）なら true、推奨（できればやってほしい）なら false。
  // category とは別の軸で、どの区分のタスクでも必須にできる（Issue #356）。
  is_required: boolean;
  reward_amount: number;
  status: QuestStatus;
  created_by: string;
  created_at: string;
  // 受注した子のid。未受注（open）の場合は null。
  assigned_to: string | null;
};

export type QuestLogStatus = "pending" | "approved" | "rejected";

export type QuestLog = {
  id: string;
  family_id: string;
  quest_id: string;
  user_id: string;
  status: QuestLogStatus;
  completed_at: string;
  approved_by: string | null;
  approved_at: string | null;
  /** 承認されたことを子供に見せた時刻（Issue #424）。承認済みで null なら、まだ見せていない */
  reward_seen_at: string | null;
};

export type TaskReportStatus = "pending" | "approved" | "rejected";

export type TaskReport = {
  id: string;
  family_id: string;
  reported_by: string;
  title: string;
  description: string;
  status: TaskReportStatus;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type StoreItem = {
  /** nullは通常商品。既存のモックでは省略できる。 */
  asset_id?: string | null;
  /** 自動陳列する着せ替え品・装飾品。通常商品と既存の手動商品はfalse。 */
  is_system_asset?: boolean;
  id: string;
  family_id: string;
  title: string;
  description: string;
  image_url: string | null;
  price: number;
  stock: number;
  // 自動陳列商品は親の登録操作がないためnull。
  requested_by: string | null;
  is_active: boolean;
  created_at: string;
};

/** 月次物価指数を反映した、子ども用ストアの商品表示データ。 */
export type PricedStoreItem = StoreItem & {
  asset_kind?: "wearable" | "decoration" | "wallpaper" | "flooring" | null;
  owned_quantity?: number;
  base_price: number;
  price_index: 95 | 100 | 105 | 110;
  sale_price: number;
};

/** 家事をしなくていい日（`quest_rest_days`。Issue #396）。子供1人・1日ごとに1行 */
export type QuestRestDay = {
  id: string;
  family_id: string;
  user_id: string;
  /** 日本時間の日付（YYYY-MM-DD） */
  rest_on: string;
  /** 設定した親（アカウントが消えたら null） */
  created_by: string | null;
  created_at: string;
};

/** 子供ごとに切り替えられる機能（Issue #348）。今は銀行だけ */
export type ChildFeature = "bank";

/** 子供ごとに「使わない」にした機能（`child_feature_restrictions`。Issue #348）。行が無ければ使える */
export type ChildFeatureRestriction = {
  id: string;
  family_id: string;
  user_id: string;
  feature: ChildFeature;
  /** 設定した親（アカウントが消えたら null） */
  created_by: string | null;
  created_at: string;
};

export type StoreItemRequestStatus = "pending" | "approved" | "rejected";

export type StoreItemRequest = {
  id: string;
  family_id: string;
  requested_by: string;
  title: string;
  description: string;
  reason: string;
  image_url: string;
  status: StoreItemRequestStatus;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type BankAccount = {
  id: string;
  user_id: string;
  deposit_balance: number;
  interest_rate: number;
  loan_balance: number;
  loan_rate: number;
  loan_limit: number;
  loan_term_days: number;
  loan_purpose: string | null;
  updated_at: string;
};

export type LoanStatus = "pending" | "active" | "rejected" | "paid";

export type Loan = {
  id: string;
  family_id: string;
  borrower_id: string;
  requested_amount: number;
  purpose: string;
  status: LoanStatus;
  monthly_interest_rate: number;
  term_days: number;
  principal_amount: number | null;
  interest_amount: number | null;
  principal_repaid: number;
  interest_repaid: number;
  request_idempotency_key: string;
  approved_by: string | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type LoanOffer = {
  loan_limit: number;
  monthly_interest_rate: number;
  term_days: number;
  outstanding_principal: number;
  treasury_available: number;
  available_amount: number;
  has_overdue: boolean;
};

export type LoanRepayment = {
  id: string;
  family_id: string;
  loan_id: string;
  borrower_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  idempotency_key: string;
  created_at: string;
};

export type TransactionType =
  | "quest_reward"
  | "store_purchase"
  | "bank_interest"
  | "bank_loan"
  | "bank_deposit"
  | "bank_withdraw"
  | "bank_repay";

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  description: string;
  amount: number;
  created_at: string;
};

