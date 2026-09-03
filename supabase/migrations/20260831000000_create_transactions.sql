-- 家庭内通貨(HMC)の増減を種類横断で記録する統一台帳。
-- quest_reward / store_purchase / bank_interest / bank_loan をすべてここに書き込み、
-- 履歴画面（HistoryScreen）はこのテーブルだけを見れば時系列表示できるようにする。
--
-- 注意: users(id uuid) / quest_logs(id uuid) は、Issue #63 の作業で実際のSupabase
-- プロジェクトのスキーマを確認済み（どちらも uuid 型）。
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (
    type in ('quest_reward', 'store_purchase', 'bank_interest', 'bank_loan')
  ),
  description text not null,
  amount integer not null,
  -- quest_reward の場合のみ設定。quest_logs の承認1件につき台帳エントリは高々1件にするための参照。
  quest_log_id uuid references public.quest_logs (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ユーザー単位・新しい順での取得（履歴画面のクエリ）を高速化する
create index transactions_user_id_created_at_idx
  on public.transactions (user_id, created_at desc);

-- 承認処理が再実行されても同じ quest_log から二重に記帳されないようにする
create unique index transactions_quest_log_id_unique
  on public.transactions (quest_log_id)
  where quest_log_id is not null;

-- 注意（既知の制約・Phase 2で対応予定、Issue #63/#64/#75と同様）:
-- transactions テーブルには RLS（Row Level Security）ポリシーが設定されていない。
-- RLSが無効のままだと、anonキーで他ユーザーの取引履歴も読み書きできてしまう。
-- このアプリはまだ Supabase Auth と連携しておらず（モックログインのみ）、
-- 現状 auth.uid() が実行時に取得できないための一時的な割り切りであり、
-- RLS を Phase 2で有効化する際に、実認証と合わせて対応する。
