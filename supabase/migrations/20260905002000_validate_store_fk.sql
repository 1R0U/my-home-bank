-- Issue #64 フォローアップ（PR #116 1R0Uさんレビュー指摘対応）--------------------
--
-- 20260905001000_split_store_fk_validation.sql で NOT VALID のまま追加した
-- store_items_requested_by_fkey を検証する。
--
-- ADD CONSTRAINT ... NOT VALID と VALIDATE CONSTRAINT を同じマイグレーション
-- ファイルに入れると、Supabase CLI が1トランザクションで実行するため、
-- ADD CONSTRAINT が取る ACCESS EXCLUSIVE ロックがコミットまで解放されず、
-- 後続の VALIDATE CONSTRAINT が SHARE UPDATE EXCLUSIVE で済んでも、
-- トランザクション全体としては検証中ずっと書き込みがブロックされたままになる。
-- そのため別ファイル（別トランザクション）に分離し、ロック分離の目的を実際に
-- 機能させる。

alter table store_items
  validate constraint store_items_requested_by_fkey;
