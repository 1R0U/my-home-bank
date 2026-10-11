-- Issue #311 フォローアップ（PR #334 1R0Uさんレビュー指摘） ---------------------
--
-- 画像をアップロードした後にDB保存（createStoreItem / createStoreItemRequest）が
-- 失敗すると、アップロード済みの画像はどの商品・申請からも使われないまま
-- store-item-images バケットに残り続けていた（再試行するたびに増える）。
--
-- アプリ側（lib/storeImageUpload.ts の deleteStoreItemImage）で、保存に失敗したら
-- アップロード済みの画像を削除するようにする。そのためには DELETE を許可する
-- ポリシーが必要（20260927000000 ... ではなく 20261002000000_create_store_item_images_bucket.sql
-- が作った INSERT 用ポリシーしかまだ無い）。
--
-- INSERT用ポリシー（store_item_images_insert_own_family）と同じ考え方で、
-- 先頭フォルダ（family_id）がログイン中利用者の家庭と一致する画像だけ削除を許可する。

create policy store_item_images_delete_own_family
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-item-images'
  and split_part(name, '/', 1) = public.current_user_family_id()::text
);
