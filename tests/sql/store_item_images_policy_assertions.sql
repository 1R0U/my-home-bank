-- Issue #311 フォローアップ（PR #334 1R0Uさんレビュー指摘） ---------------------
--
-- store_item_images_select_own_upload / delete_own_upload
-- （20261004000100_restrict_store_item_images_to_owner.sql）が、
-- アップロードした本人だけ操作できる・同じ家庭の他人や別家庭からは
-- 操作できないことを検証する。
--
-- SupabaseのStorage remove()はSELECTとDELETEの両方のポリシーを必要とする
-- （PostgreSQLのRLSでは、WHERE付きのDELETEにもSELECTポリシーが適用されるため）。
-- SELECTが効いていないと、DELETEはエラーにならず常に0件で終わる。この
-- 「何も起きないまま成功したように見える」失敗は通常のアサーションでは
-- 検知しづらいため、削除で実際に影響を受けた行数を確認する。

\set ON_ERROR_STOP on

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
end;
$$;

-- 動的SQLを実行し、影響を受けた行数を返す。
create function pg_temp.affected_rows(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

insert into public.families (id, name) values
  ('d1000000-0000-4000-8000-000000000001', 'Storage検証家族A'),
  ('d1000000-0000-4000-8000-000000000002', 'Storage検証家族B');

insert into public.users (id, family_id, name, role, balance) values
  ('d1000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000001', 'アップロード本人', 'child', 0),
  ('d1000000-0000-4000-8000-000000000012', 'd1000000-0000-4000-8000-000000000001', '同じ家庭の別利用者', 'parent', 0),
  ('d1000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000002', '別家庭の利用者', 'child', 0);

insert into public.guild_treasuries (
  family_id, balance, initial_supply, total_supply, minimum_reserve_rate
) values
  ('d1000000-0000-4000-8000-000000000001', 0, 0, 0, 0.2000),
  ('d1000000-0000-4000-8000-000000000002', 0, 0, 0, 0.2000);

insert into storage.objects (id, bucket_id, name, owner_id) values
  ('d2000000-0000-4000-8000-000000000001', 'store-item-images',
   'd1000000-0000-4000-8000-000000000001/photo.jpg', 'd1000000-0000-4000-8000-000000000011');

set role authenticated;

\echo '=== 1. 別家庭の利用者には見えない・消せない ==='

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000021', true);
select pg_temp.assert(
  (select count(*) from storage.objects where id = 'd2000000-0000-4000-8000-000000000001') = 0,
  '別家庭の利用者には画像が見えない'
);
select pg_temp.assert(
  pg_temp.affected_rows(
    $$delete from storage.objects where id = 'd2000000-0000-4000-8000-000000000001'$$
  ) = 0,
  '別家庭の利用者は画像を削除できない'
);

\echo '=== 2. 同じ家庭でも、アップロードした本人以外には見えない・消せない ==='

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000012', true);
select pg_temp.assert(
  (select count(*) from storage.objects where id = 'd2000000-0000-4000-8000-000000000001') = 0,
  '同じ家庭の別利用者には画像が見えない'
);
select pg_temp.assert(
  pg_temp.affected_rows(
    $$delete from storage.objects where id = 'd2000000-0000-4000-8000-000000000001'$$
  ) = 0,
  '同じ家庭の別利用者は画像を削除できない'
);

\echo '=== 3. アップロードした本人には見え、削除もできる ==='

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000011', true);
select pg_temp.assert(
  (select count(*) from storage.objects where id = 'd2000000-0000-4000-8000-000000000001') = 1,
  'アップロードした本人には画像が見える'
);
select pg_temp.assert(
  pg_temp.affected_rows(
    $$delete from storage.objects where id = 'd2000000-0000-4000-8000-000000000001'$$
  ) = 1,
  'アップロードした本人は画像を削除できる（remove()が実際に消せる）'
);

\echo '=== すべての検証を通過しました ==='

rollback;
