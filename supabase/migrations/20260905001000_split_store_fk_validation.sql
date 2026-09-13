-- Issue #64 フォローアップ（PR #116 CodeRabbitレビュー対応）--------------------
--
-- store_items.requested_by の外部キー制約を、既存の store_items・users 双方への
-- 書き込みをブロックするロックを取得しながら検証すると、稼働中に実行した場合に
-- 購入処理やアイテム追加が一時的に止まる可能性がある。そのため
-- 「制約追加（NOT VALID・検証スキップ）」と「検証（VALIDATE CONSTRAINT）」を
-- 別マイグレーションに分離する。
--
-- 20260905000000_connect_store.sql は requested_by 列のみを追加しており
-- （外部キーは付けていない）、外部キー制約はこのマイグレーションで NOT VALID として
-- 追加する。検証（VALIDATE CONSTRAINT、SHARE UPDATE EXCLUSIVE ロックのみで済み、
-- 通常の読み書きをブロックしない）は 20260905002000_validate_store_fk.sql で行う。
-- Supabase CLI はマイグレーションファイルを1トランザクションで実行するため、
-- 同じファイルに両方を入れると ADD CONSTRAINT が取る ACCESS EXCLUSIVE ロックが
-- コミットまで解放されず、ロック分離の意味が無くなってしまう。
--
-- PostgreSQLは同名制約の重複追加を許可しないため、既にこの制約が存在する環境では
-- このマイグレーションは no-op として安全にスキップされるよう if not exists 相当の
-- ガードをつけている。

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_items_requested_by_fkey'
      and conrelid = 'store_items'::regclass
  ) then
    alter table store_items
      add constraint store_items_requested_by_fkey
      foreign key (requested_by) references users(id)
      not valid;
  end if;
end $$;
