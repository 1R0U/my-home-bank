-- PR #116: store_items テーブルを作るマイグレーションを追加する ------------------
--
-- 【背景】
-- Issue #187 の調査で判明した users/quests/quest_logs と同じパターンで、
-- store_items も開発初期にSupabaseの管理画面（Table Editor）で作られており、
-- マイグレーションファイルが存在しなかった。そのため、空のSupabaseプロジェクトへ
-- supabase/migrations/ を順に適用すると、20260905000000_connect_store.sql の
-- alter table store_items で「relation "store_items" does not exist」となり失敗する。
--
-- 【このファイルの位置づけ】
-- 既存環境向けの変更ではなく、新規環境で同じ構造を再現するための「追いつき用」。
-- create table if not exists のため、既存環境では何も起きない。
-- 20260830000000_create_core_tables.sql が取っている手法と同じ。
--
-- 【requested_by・image_url をここに含めない理由】
-- types/index.ts の StoreItem 型コメントの通り、この2列は
-- 20260905000000_connect_store.sql が「NOT NULL制約・デフォルト値なしで」
-- 追加したものであり、元のテーブルには存在しない。ここに含めてしまうと、
-- 追いつき用のこのファイルを通った新規環境だけ、connect_store.sql の
-- add column if not exists が実質的に何もしない no-op になり、既存環境と
-- 構造の作られ方が食い違う。

create table if not exists store_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  price numeric not null,
  stock numeric not null,
  created_at timestamptz not null default now()
);
