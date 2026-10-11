-- Issue #311: 商品追加・商品追加申請で画像をアップロードできるようにする -----------------
--
-- 【なぜ要るか】
-- 親のアイテム追加フォームの「画像追加」ボタンは未実装のまま無効化されていた。
-- 子供の商品追加申請は画像を選べるが、選んだ画像の端末内URI（file://...）を
-- そのまま store_item_requests.image_url に保存しており、申請した端末以外
-- （親の端末など）では表示できなかった。どちらも、他の端末からも見られる
-- 場所へ画像をアップロードする仕組みが無いことが原因。
--
-- 【バケットを公開（public）にする理由】
-- 商品画像は家庭の金銭情報のような機微なデータではなく、またRLSはSupabase
-- Storageの公開URL経由の取得（GET）には適用されない（公開バケットかどうかで
-- API層が判定する）。非公開バケット＋署名付きURLにすると、長期間表示され続ける
-- 商品一覧のために有効期限切れを防ぐ再発行の仕組みが別途必要になり、この
-- Issueの範囲に対して複雑さが見合わない。書き込み（アップロード）側だけを
-- 家庭単位で絞る。
--
-- 【パスの形について】
-- アップロード先のパスを `{family_id}/{ファイル名}` の形に固定し、INSERTポリシーで
-- 先頭フォルダ（family_id）がログイン中利用者の家庭と一致するかを確認する。
-- `storage.foldername()`（Supabase標準の補助関数）を使わず `split_part` にしているのは、
-- 素のPostgreSQL（CIのDB Migrationジョブ）でも同じポリシーを検証できるようにするため。

insert into storage.buckets (id, name, public)
values ('store-item-images', 'store-item-images', true)
on conflict (id) do nothing;

create policy store_item_images_insert_own_family
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-item-images'
  and split_part(name, '/', 1) = public.current_user_family_id()::text
);
