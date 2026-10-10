// このファイルは scripts/generate-db-types.mjs が生成する。手で編集しない。
// マイグレーションで列を変えたら、全マイグレーションを適用したDBに対して再生成する
// （手順は docs/DEVELOPMENT.md「DBの型を生成する」）。

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** public スキーマのテーブルごとの、1行の型（`select("*")` で返る形）。 */
export type DbTables = {
  bank_accounts: {
    id: string;
    user_id: string;
    deposit_balance: number;
    interest_rate: number;
    loan_balance: number;
    loan_rate: number;
    loan_purpose: string | null;
    updated_at: string;
    loan_limit: number;
    loan_term_days: number;
  };
  bank_operations: {
    operation_id: string;
    user_id: string;
    kind: string;
    amount: number;
    result: Json;
    created_at: string;
  };
  character_appearances: {
    user_id: string;
    character_type: string;
    updated_at: string;
    accent_color: string | null;
    hair_color: string | null;
    skin_color: string | null;
  };
  character_palettes: {
    user_id: string;
    character_type: string;
    accent_color: string | null;
    hair_color: string | null;
    skin_color: string | null;
    updated_at: string;
  };
  economy_monthly_snapshots: {
    id: string;
    family_id: string;
    snapshot_month: string;
    avg_circulating_hmc: number;
    target_hmc: number;
    price_index: number;
    calculation_basis: Json;
    created_at: string;
    avg_circulating_gol: number;
    target_gol: number;
  };
  economy_settings: {
    family_id: string;
    price_index_thresholds: Json;
    target_months: number;
    updated_at: string;
  };
  economy_transactions: {
    id: string;
    family_id: string;
    actor_user_id: string | null;
    type: string;
    from_account_type: string;
    from_user_id: string | null;
    to_account_type: string;
    to_user_id: string | null;
    amount: number;
    description: string;
    related_type: string | null;
    related_id: string | null;
    idempotency_key: string;
    created_at: string;
    store_base_price: number | null;
    store_price_index: number | null;
    store_sale_price: number | null;
  };
  equipped_items: {
    user_id: string;
    slot: string;
    asset_id: string;
    updated_at: string;
  };
  families: {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
  };
  guild_treasuries: {
    id: string;
    family_id: string;
    balance: number;
    initial_supply: number;
    total_supply: number;
    minimum_reserve_rate: number;
    created_at: string;
    updated_at: string;
  };
  loan_repayments: {
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
  loans: {
    id: string;
    family_id: string;
    borrower_id: string;
    requested_amount: number;
    purpose: string;
    status: string;
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
  notifications: {
    id: string;
    user_id: string;
    title: string;
    body: string;
    route: string | null;
    created_at: string;
    read_at: string | null;
    dedupe_key: string | null;
  };
  owned_items: {
    user_id: string;
    asset_id: string;
    acquired_at: string;
  };
  placed_decorations: {
    id: string;
    user_id: string;
    asset_id: string;
    position_x: number;
    position_z: number;
    rotation_y: number;
    scale: number;
    created_at: string;
  };
  quest_logs: {
    id: string;
    quest_id: string;
    user_id: string;
    status: string;
    completed_at: string;
    approved_by: string | null;
    approved_at: string | null;
    family_id: string;
  };
  quest_streak_celebrations: {
    id: string;
    user_id: string;
    streak_started_on: string;
    milestone_days: number;
    celebrated_at: string;
  };
  quests: {
    id: string;
    title: string;
    description: string | null;
    reward_amount: number;
    status: string;
    created_by: string | null;
    created_at: string;
    category: string;
    assigned_to: string | null;
    family_id: string;
    is_required: boolean;
  };
  savings_accounts: {
    user_id: string;
    family_id: string;
    balance: number;
    monthly_amount: number;
    next_transfer_month: string;
    created_at: string;
  };
  savings_interest_months: {
    family_id: string;
    target_month: string;
    treasury_balance: number;
    total_supply: number;
    monthly_rate: number;
    created_at: string;
  };
  savings_monthly_runs: {
    family_id: string;
    user_id: string;
    target_month: string;
    kind: string;
    requested_amount: number;
    amount: number;
    status: string;
    average_balance: number | null;
    monthly_rate: number | null;
    created_at: string;
  };
  savings_settings: {
    family_id: string;
    transfer_day: number;
  };
  store_item_requests: {
    id: string;
    requested_by: string;
    title: string;
    description: string;
    reason: string;
    image_url: string;
    status: string;
    created_at: string;
    approved_by: string | null;
    approved_at: string | null;
    family_id: string;
  };
  store_items: {
    id: string;
    title: string;
    description: string;
    price: number;
    stock: number;
    created_at: string;
    requested_by: string;
    image_url: string | null;
    family_id: string;
    is_active: boolean;
    updated_at: string;
  };
  task_reports: {
    id: string;
    reported_by: string;
    title: string;
    description: string;
    status: string;
    created_at: string;
    approved_by: string | null;
    approved_at: string | null;
    family_id: string;
  };
  transactions: {
    id: string;
    user_id: string;
    type: string;
    description: string;
    amount: number;
    quest_log_id: string | null;
    created_at: string;
  };
  users: {
    id: string;
    name: string;
    role: string;
    balance: number;
    created_at: string;
    notifications_enabled: boolean;
    family_id: string | null;
    birth_date: string | null;
    gender: string | null;
  };
  wallet_circulation_changes: {
    id: number;
    family_id: string;
    amount: number;
    recorded_at: string;
  };
  wallet_circulation_tracking: {
    family_id: string;
    known_from: string;
  };
};

/** テーブルの1行の型。 */
export type DbRow<T extends keyof DbTables> = DbTables[T];
