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

export type Quest = {
  id: string;
  family_id: string;
  title: string;
  description: string;
  category: QuestCategory;
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
  id: string;
  family_id: string;
  title: string;
  description: string;
  image_url: string | null;
  price: number;
  stock: number;
  // 金庫決済マイグレーションでNOT NULL化済み。
  requested_by: string;
  is_active: boolean;
  created_at: string;
};

/** 月次物価指数を反映した、子ども用ストアの商品表示データ。 */
export type PricedStoreItem = StoreItem & {
  base_price: number;
  price_index: 95 | 100 | 105 | 110;
  sale_price: number;
};

/**
 * 着せ替え品・装飾品の品書き（`shop_items`。Issue #225）。アプリ共通で、家庭ごとではない。
 * 見た目と付く場所はコード側のカタログ（lib/rpg-hub/catalog.ts）が持ち、asset_id で結ぶ。
 */
export type ShopItemKind = "wearable" | "decoration";

export type ShopItem = {
  id: string;
  asset_id: string;
  kind: ShopItemKind;
  title: string;
  /** 基準価格（物価指数を掛ける前）。最初から持っている品は null */
  price: number | null;
  /** 最初から持っている品か（買えない。利用者が増えると配られる） */
  is_starter: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

/** `get_shop_catalog` が返す、買う品1つ。販売価格は物価指数を掛けたもの */
export type ShopCatalogItem = Pick<ShopItem, "id" | "asset_id" | "kind" | "title"> & {
  base_price: number;
  price_index: PricedStoreItem["price_index"];
  sale_price: number;
  /** ログイン中の利用者がもう持っているか */
  owned: boolean;
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

