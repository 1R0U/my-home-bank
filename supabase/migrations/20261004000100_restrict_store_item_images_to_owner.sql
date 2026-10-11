-- Issue #311 フォローアップ（PR #334 1R0Uさんレビュー指摘） ---------------------
--
-- lib/storeImageUpload.ts の deleteStoreItemImage（保存失敗時の後片付け）が
-- 本番で実質効かない問題への対応。
--
-- Supabase Storageの remove() は、storage.objects に対して SELECT と DELETE の
-- 両方のポリシーが必要（PostgreSQLのRLSでは、WHERE付きのDELETEにもSELECTポリシーが
-- 適用されるため）。20261003000100_allow_delete_store_item_images_own_family.sql は
-- DELETEポリシーしか作っておらず、SELECTポリシーがないため削除対象の行が見えず、
-- remove() は常に0件削除・エラーなしで終わっていた（孤立した画像は削除されないまま残る）。
--
-- また、削除できる範囲も「先頭フォルダ（family_id）が自分の家庭と一致する」だけで、
-- 家庭の誰でも、家庭内の他の人がアップロードした画像（使用中のものも含む）を
-- 削除できてしまっていた。削除の目的はアップロードした本人による後片付けのみなので、
-- アップロードした本人（storage.objects.owner_id、Supabaseがアップロード時に設定する）に絞る。
--
-- 適用済みのマイグレーションは書き換えないルールのため、20261003000100の
-- DELETEポリシーを drop して作り直し、SELECTポリシーを新設する。

drop policy store_item_images_delete_own_family on storage.objects;

create policy store_item_images_select_own_upload
on storage.objects
for select
to authenticated
using (
  bucket_id = 'store-item-images'
  and split_part(name, '/', 1) = public.current_user_family_id()::text
  and owner_id = auth.uid()::text
);

create policy store_item_images_delete_own_upload
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-item-images'
  and split_part(name, '/', 1) = public.current_user_family_id()::text
  and owner_id = auth.uid()::text
);
