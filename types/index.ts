export type UserRole = "parent" | "child";

export type User = {
  id: string;
  name: string;
  role: UserRole;
  balance: number;
  created_at: string;
};

export type QuestStatus = "open" | "accepted" | "pending" | "completed";
export type Quest = {
  id: string;
  title: string;
  description: string;
  reward_amount: number;
  status: QuestStatus;
  created_by: string;
  created_at: string;
  category?: QuestCategory;
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
  price: number;
  stock: number;
  created_at: string;
  image_url?: string;
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

export type QuestCategory = "daily" | "weekly" | "limited";

export type FamilyRole = "father" | "mother" | "child";

export type Gender = "male" | "female" | "unspecified";

export type OnboardingProfile = {
  name: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  familyRole?: FamilyRole;
  gender?: Gender;
};
