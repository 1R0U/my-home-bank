-- Issue #311 フォローアップ（PR #334 CodeRabbitレビュー指摘） ---------------------
--
-- 20261003000000_carry_over_store_item_request_image.sql で、承認時に
-- store_items へ image_url をコピーする際、「store-item-images バケットの、
-- 自分の家庭のフォルダ配下」というパスの形をしているURLだけを引き継ぐようにした。
-- CodeRabbitからは、INSERT時にも同じ条件を適用すべきという指摘が続いている。
--
-- store_item_requests_insert_self（20260923000300_enable_family_rls.sql。適用済みのため
-- 書き換えない）はINSERT時に image_url の形式を検証していなかった。アプリを経由しない
-- 直接のAPI呼び出しで子供が任意の外部URLを登録できると、承認前でも親画面（一覧・詳細）が
-- その image_url を読み込んでしまう（承認待ちの間も外部サーバーへ接続する）ため、
-- 承認時だけでなくINSERT時にも同じパスの形の検証を行う。
--
-- 承認時チェックと同じく、これはパスの形だけの検証であり、ドメイン（オリジン）自体は
-- 確認できない（別ドメインに同じパスを用意されると素通りする）。オリジンまで検証するには
-- Supabaseプロジェクトの公開URLをSQL側から確認できる仕組みが別途必要で、このPRのスコープを
-- 超えるため対応しない（20261003000000_carry_over_store_item_request_image.sql と同じ理由）。
--
-- アプリ（StoreItemRequestScreen / ParentStoreScreen）は必ず uploadStoreItemImage で
-- アップロードした後の公開URLを image_url として送るため、通常の利用でこの条件に
-- 引っかかることはない。

drop policy store_item_requests_insert_self on public.store_item_requests;

create policy store_item_requests_insert_self on public.store_item_requests
for insert to authenticated
with check (
  family_id = public.current_user_family_id()
  and requested_by = auth.uid()
  and status = 'pending'
  and image_url like ('%/store-item-images/' || family_id::text || '/%')
);
