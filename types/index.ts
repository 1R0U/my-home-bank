export type UserRole = "parent" | "child";

export type Gender = "male" | "female" | "unspecified";

export type FamilyRole = "father" | "mother" | "child";

export type OnboardingProfile = {
  name: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  gender?: Gender;
  familyRole?: FamilyRole;
};

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
  quest_id: string;
  user_id: string;
  status: QuestLogStatus;
  completed_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type StoreItem = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  price: number;
  stock: number;
  requested_by: string;
  created_at: string;
};

export type StoreItemRequestStatus = "pending" | "approved" | "rejected";

export type StoreItemRequest = {
  id: string;
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
  loan_purpose: string | null;
  updated_at: string;
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

