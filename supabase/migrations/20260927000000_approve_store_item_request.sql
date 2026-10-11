-- Issue #131: 親用ストアに商品追加申請の承認・拒否タブを追加する -----------
--
-- approve_store_item_request:
--   store_item_requests を行ロックして pending であることを検証し、
--   承認済みに更新した上で、指定された価格で store_items を作成する。
--   1トランザクションで実行するため、商品作成に失敗した場合は申請の承認も
--   ロールバックされる（申請だけが承認済みになることはない）。
--   pending の検証を行ロック中に行うため、同じ申請から商品が複数作成されることもない。
--
-- reject_store_item_request:
--   store_item_requests を行ロックして pending であることを検証し、拒否済みに更新する。
--   ストア商品は作成しない。
--
-- 認証・家庭境界の検証は、20260923000400_secure_family_rpcs.sql の
-- approve_quest_log / reject_quest_log と同じ構成にする（public側の認証・親ロール・
-- 家庭境界チェックのラッパー ＋ private側の実処理）。このマイグレーションはまだ
-- 実DBに適用されていないため、後から書き換えるのではなく最初からこの形で作る
-- （1R0Uさんレビュー指摘）。

-- private.approve_store_item_request_unchecked:
--   承認の実処理。呼び出し元（public.approve_store_item_request）が認可を
--   済ませている前提で、認可チェックはしない。
create or replace function private.approve_store_item_request_unchecked(
  p_request_id uuid,
  p_approver_id uuid,
  p_price integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_description text;
  v_requested_by uuid;
  v_family_id uuid;
begin
  if p_price is null or p_price < 1 then
    raise exception '価格は1以上の整数で指定してください';
  end if;

  select title, description, requested_by, family_id
    into v_title, v_description, v_requested_by, v_family_id
  from public.store_item_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_title is null then
    -- errcode は lib/storeItemRequestService.ts の
    -- STORE_ITEM_REQUEST_ALREADY_PROCESSED_SQLSTATE と対応させている。
    -- メッセージの部分一致ではなくこのコードで判定するため、文言を変えても壊れない。
    raise exception '対象の申請が見つからないか、すでに処理されています'
      using errcode = 'ST0AP';
  end if;

  update public.store_item_requests
    set status = 'approved', approved_by = p_approver_id, approved_at = now()
    where id = p_request_id;

  -- store_item_requests.image_url は申請した子供の端末のアプリサンドボックス内パス
  -- （file://...）で、画像アップロードが未実装のため他端末からは解決できない。
  -- store_items.image_url へそのままコピーすると、承認された商品が全端末で壊れた
  -- 画像URLを持つ行として恒久的に残ってしまうため、ここでは null のままにする。
  -- 画像アップロードを実装したら、そのときに改めて紐付ける。
  --
  -- 在庫は store_unlimited_stock()（20260905000000_connect_store.sql）で無制限扱いにする。
  -- 値をここへ直接書かないのは、TS側の UNLIMITED_STOCK 定数との食い違いを防ぐため
  -- （tests/sql/treasury_payments_assertions.sql がこの関数の戻り値と突き合わせている）。
  insert into public.store_items (family_id, title, description, image_url, price, stock, requested_by)
  values (v_family_id, v_title, v_description, null, p_price, public.store_unlimited_stock(), v_requested_by);
end;
$$;

revoke all on function private.approve_store_item_request_unchecked(uuid, uuid, integer)
from public, anon, authenticated;

-- private.reject_store_item_request_unchecked:
--   拒否の実処理。認可チェックはしない。
create or replace function private.reject_store_item_request_unchecked(
  p_request_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.store_item_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_id is null then
    raise exception '対象の申請が見つからないか、すでに処理されています'
      using errcode = 'ST0AP';
  end if;

  update public.store_item_requests
    set status = 'rejected', approved_by = p_approver_id, approved_at = now()
    where id = p_request_id;
end;
$$;

revoke all on function private.reject_store_item_request_unchecked(uuid, uuid)
from public, anon, authenticated;

-- public.approve_store_item_request:
--   認証・親ロール・家庭境界を検証してから private 側を呼ぶ。
--   「auth.uid() is not null or session_user is distinct from current_user」は、
--   実際のクライアント呼び出し（PostgREST経由、auth.uid()が入る）と、RLSの
--   ロール切り替えを伴う呼び出しだけガードを通す。テスト・マイグレーションで
--   postgresロールから直接呼ぶ経路（auth.uid()がnullかつロール切り替えなし）は
--   ガードを素通しする（20260923000400_secure_family_rpcs.sql と同じ考え方）。
create or replace function public.approve_store_item_request(
  p_request_id uuid,
  p_approver_id uuid,
  p_price integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null or session_user is distinct from current_user then
    if auth.uid() is null or auth.uid() is distinct from p_approver_id then
      raise exception '承認者がログイン利用者と一致しません';
    end if;
    if not exists (
      select 1 from public.users
      where id = auth.uid() and role = 'parent'
    ) then
      raise exception '親だけが商品追加申請を承認できます';
    end if;
    if not exists (
      select 1 from public.store_item_requests
      where id = p_request_id and family_id = public.current_user_family_id()
    ) then
      raise exception '別の家庭の申請は操作できません';
    end if;
  end if;
  perform private.approve_store_item_request_unchecked(p_request_id, p_approver_id, p_price);
end;
$$;

revoke all on function public.approve_store_item_request(uuid, uuid, integer) from public, anon;
grant execute on function public.approve_store_item_request(uuid, uuid, integer) to authenticated;

-- public.reject_store_item_request: 上と同じ構成。
create or replace function public.reject_store_item_request(
  p_request_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null or session_user is distinct from current_user then
    if auth.uid() is null or auth.uid() is distinct from p_approver_id then
      raise exception '却下者がログイン利用者と一致しません';
    end if;
    if not exists (
      select 1 from public.users
      where id = auth.uid() and role = 'parent'
    ) then
      raise exception '親だけが商品追加申請を却下できます';
    end if;
    if not exists (
      select 1 from public.store_item_requests
      where id = p_request_id and family_id = public.current_user_family_id()
    ) then
      raise exception '別の家庭の申請は操作できません';
    end if;
  end if;
  perform private.reject_store_item_request_unchecked(p_request_id, p_approver_id);
end;
$$;

revoke all on function public.reject_store_item_request(uuid, uuid) from public, anon;
grant execute on function public.reject_store_item_request(uuid, uuid) to authenticated;
