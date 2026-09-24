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
  monthly_interest_rate: number | null;
  term_days: number | null;
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

export type LoanRequestStatus = "pending" | "approved" | "rejected";

export type LoanRequest = {
  id: string;
  user_id: string;
  amount: number;
  purpose: string;
  status: LoanRequestStatus;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
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

