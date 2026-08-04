import type {
  User,
  Quest,
  QuestLog,
  StoreItem,
  BankAccount,
  Transaction,
} from "../types";

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
    status: "completed",
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
  {
    id: "log-3",
    quest_id: "quest-1",
    user_id: "user-child-1",
    status: "approved",
    completed_at: "2026-07-10T20:00:00Z",
    approved_by: "user-parent-1",
    approved_at: "2026-07-10T21:00:00Z",
  },
];

export const MOCK_STORE_ITEMS: StoreItem[] = [
  {
    id: "item-1",
    title: "夕飯リクエスト権",
    description: "その日の夜ご飯のメニューをリクエストできる",
    image_url:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop",
    price: 100,
    stock: 99,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-2",
    title: "ゲーム1時間延長券",
    description: "その日のゲーム時間を1時間延ばせる",
    image_url:
      "https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600&auto=format&fit=crop",
    price: 80,
    stock: 99,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-3",
    title: "お小遣い両替券（100円）",
    description: "100 $HMC を現金100円に交換できる",
    image_url:
      "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop",
    price: 100,
    stock: 10,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-4",
    title: "パパにマッサージしてもらえる券",
    description: "10分間マッサージしてもらえる",
    image_url:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&auto=format&fit=crop",
    price: 150,
    stock: 5,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-5",
    title: "映画ナイト決定権",
    description: "家族で見る映画を選べる",
    image_url:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop",
    price: 120,
    stock: 3,
    created_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "item-6",
    title: "スペシャルデザート",
    description: "好きなデザートをリクエストできる",
    image_url:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop",
    price: 70,
    stock: 8,
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

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-0",
    user_id: "user-child-1",
    type: "quest_reward",
    description: "お風呂掃除",
    amount: 50,
    created_at: "2026-07-10T21:00:00Z",
  },
  {
    id: "tx-1",
    user_id: "user-child-2",
    type: "quest_reward",
    description: "部屋の掃除機がけ",
    amount: 60,
    created_at: "2026-07-11T19:00:00Z",
  },
  {
    id: "tx-2",
    user_id: "user-child-1",
    type: "store_purchase",
    description: "夕飯リクエスト権と交換",
    amount: -100,
    created_at: "2026-07-12T20:00:00Z",
  },
  {
    id: "tx-3",
    user_id: "user-child-2",
    type: "store_purchase",
    description: "ゲーム1時間延長券と交換",
    amount: -80,
    created_at: "2026-07-13T17:00:00Z",
  },
  {
    id: "tx-4",
    user_id: "user-child-1",
    type: "bank_interest",
    description: "銀行預金の利息",
    amount: 10,
    created_at: "2026-07-13T00:00:00Z",
  },
  {
    id: "tx-5",
    user_id: "user-child-2",
    type: "bank_loan",
    description: "銀行から借入",
    amount: 300,
    created_at: "2026-07-10T12:00:00Z",
  },
];

// 現在ログイン中のユーザー（開発・テスト用）
export const MOCK_CURRENT_USER = MOCK_USERS[1];
