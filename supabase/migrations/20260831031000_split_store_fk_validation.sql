-- Issue #64 フォローアップ（PR #116 CodeRabbitレビュー対応）--------------------
--
-- store_items.requested_by の外部キー制約が、既存の store_items から
-- users 双方への書き込みをブロックするロックを取得しながら検証されていた。
-- 稼働中に実行すると購入処理やアイテム追加が一時的に止まる可能性があるため、
-- 「制約追加（NOT VALID・検証スキップ）」と「検証（VALIDATE CONSTRAINT）」を
-- 分離する。VALIDATE CONSTRAINT は SHARE UPDATE EXCLUSIVE ロックのみで済み、
-- 通常の読み書きをブロックしない。
--
-- 元のマイグレーション（20260831030000_connect_store.sql）が
-- `references users(id)` 付きで既にカラムを作成している場合、
-- 以下は制約が無い状態から追加することを想定している
-- （PostgreSQLは同名制約の重複追加を許可しないため、既に検証済みの環境では
-- このマイグレーションは no-op として安全にスキップされるよう if not exists 相当の
-- ガードをつけている）。

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_items_requested_by_fkey'
  ) then
    alter table store_items
      add constraint store_items_requested_by_fkey
      foreign key (requested_by) references users(id)
      not valid;
  end if;
end $$;

alter table store_items
  validate constraint store_items_requested_by_fkey;
