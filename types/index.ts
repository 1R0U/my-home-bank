export type UserRole = "parent" | "child";

export type User = {
  id: string;
  name: string;
  role: UserRole;
  balance: number;
  created_at: string;
};

export type QuestStatus = "open" | "pending" | "completed";

export type Quest = {
  id: string;
  title: string;
  description: string;
  reward_amount: number;
  status: QuestStatus;
  created_by: string;
  created_at: string;
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
  created_at: string;
};

export type BankAccount = {
  id: string;
  user_id: string;
  deposit_balance: number;
  interest_rate: number;
  loan_balance: number;
  loan_rate: number;
  updated_at: string;
};

export type TransactionType =
  | "quest_reward"
  | "store_purchase"
  | "bank_interest"
  | "bank_loan";

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  description: string;
  amount: number;
  created_at: string;
};
