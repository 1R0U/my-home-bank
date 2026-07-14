import type { User, Quest, QuestLog, StoreItem, BankAccount, LoanApplication } from "../types";

export const MOCK_USERS: User[] = [
  {
    id: "user-parent-1",
    name: "お父さん",
    role: "parent",
    balance: 500,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "user-child-1",
    name: "たろう",
    role: "child",
    balance: 320,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "user-child-2",
    name: "はなこ",
    role: "child",
    balance: 150,
    created_at: "2026-07-01T00:00:00Z",
  },
];

export const MOCK_QUESTS: Quest[] = [
  {
    id: "quest-1",
    title: "お風呂掃除",
    description: "浴槽・床・鏡をきれいに磨く",
    reward_amount: 50,
    status: "open",
    created_by: "user-parent-1",
    created_at: "2026-07-10T09:00:00Z",
  },
  {
    id: "quest-2",
    title: "宿題を終わらせる",
    description: "学校の宿題をすべて完了する",
    reward_amount: 30,
    status: "open",
    created_by: "user-parent-1",
    created_at: "2026-07-10T09:00:00Z",
  },
  {
    id: "quest-3",
    title: "洗い物をする",
    description: "食後の食器を洗って片付けるまで",
    reward_amount: 40,
    status: "pending",
    created_by: "user-parent-1",
    created_at: "2026-07-10T09:00:00Z",
  },
  {
    id: "quest-4",
    title: "部屋の掃除機がけ",
    description: "リビングと廊下に掃除機をかける",
    reward_amount: 60,
    status: "completed",
    created_by: "user-parent-1",
    created_at: "2026-07-08T09:00:00Z",
  },
  {
    id: "quest-5",
    title: "ゴミを出す",
    description: "燃えるゴミをまとめて出す",
    reward_amount: 20,
    status: "open",
    created_by: "user-parent-1",
    created_at: "2026-07-11T09:00:00Z",
  },
];

export const MOCK_QUEST_LOGS: QuestLog[] = [
  {
    id: "log-1",
    quest_id: "quest-3",
    user_id: "user-child-1",
    status: "pending",
    completed_at: "2026-07-12T18:30:00Z",
    approved_by: null,
    approved_at: null,
  },
  {
    id: "log-2",
    quest_id: "quest-4",
    user_id: "user-child-2",
    status: "approved",
    completed_at: "2026-07-11T15:00:00Z",
    approved_by: "user-parent-1",
    approved_at: "2026-07-11T19:00:00Z",
  },
];

export const MOCK_STORE_ITEMS: StoreItem[] = [
  {
    id: "item-1",
    title: "夕飯リクエスト権",
    description: "その日の夜ご飯のメニューをリクエストできる",
    price: 100,
    stock: 99,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-2",
    title: "ゲーム1時間延長券",
    description: "その日のゲーム時間を1時間延ばせる",
    price: 80,
    stock: 99,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-3",
    title: "お小遣い両替券（100円）",
    description: "100 $HMC を現金100円に交換できる",
    price: 100,
    stock: 10,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-4",
    title: "パパにマッサージしてもらえる券",
    description: "10分間マッサージしてもらえる",
    price: 150,
    stock: 5,
    created_at: "2026-07-01T00:00:00Z",
  },
];

export const MOCK_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: "bank-1",
    user_id: "user-child-1",
    deposit_balance: 200,
    interest_rate: 0.05,
    loan_balance: 0,
    loan_rate: 0.1,
    updated_at: "2026-07-13T00:00:00Z",
  },
  {
    id: "bank-2",
    user_id: "user-child-2",
    deposit_balance: 0,
    interest_rate: 0.05,
    loan_balance: 300,
    loan_rate: 0.1,
    updated_at: "2026-07-13T00:00:00Z",
  },
];

// 現在ログイン中のユーザー（開発・テスト用）
export const MOCK_CURRENT_USER = MOCK_USERS[1];

export const MOCK_LOAN_APPLICATIONS: LoanApplication[] = [
  {
    id: "loan-1",
    user_id: "user-child-1",
    amount: 200,
    purpose: "ゲームソフトを買いたい",
    status: "approved",
    interest_rate: 0.1,
    term_weeks: 4,
    weekly_payment: 55,
    remaining_balance: 165,
    applied_at: "2026-07-08T10:00:00Z",
    approved_at: "2026-07-08T18:00:00Z",
  },
  {
    id: "loan-2",
    user_id: "user-child-2",
    amount: 300,
    purpose: "おもちゃを買いたい",
    status: "pending",
    interest_rate: 0.1,
    term_weeks: 6,
    weekly_payment: 55,
    remaining_balance: 300,
    applied_at: "2026-07-12T14:00:00Z",
    approved_at: null,
  },
  {
    id: "loan-3",
    user_id: "user-child-1",
    amount: 100,
    purpose: "本を買いたい",
    status: "repaid",
    interest_rate: 0.1,
    term_weeks: 2,
    weekly_payment: 55,
    remaining_balance: 0,
    applied_at: "2026-06-20T09:00:00Z",
    approved_at: "2026-06-20T17:00:00Z",
  },
];
