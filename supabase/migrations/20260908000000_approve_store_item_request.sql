-- Issue #131: 親用ストアに商品追加申請の承認・拒否タブを追加する -----------
--
-- approve_store_item_request:
--   store_item_requests を行ロックして pending であることを検証し、
--   承認済みに更新した上で、指定されたポイント数で store_items を作成する。
--   1トランザクションで実行するため、商品作成に失敗した場合は申請の承認も
--   ロールバックされる（申請だけが承認済みになることはない）。
--   pending の検証を行ロック中に行うため、同じ申請から商品が複数作成されることもない。
--
-- reject_store_item_request:
--   store_item_requests を行ロックして pending であることを検証し、拒否済みに更新する。
--   ストア商品は作成しない。

create or replace function approve_store_item_request(
  p_request_id uuid,
  p_approver_id uuid,
  p_price integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_description text;
  v_image_url text;
  v_requested_by uuid;
begin
  if p_price is null or p_price < 1 then
    raise exception 'invalid price: %', p_price;
  end if;

  select title, description, image_url, requested_by
    into v_title, v_description, v_image_url, v_requested_by
  from store_item_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_title is null then
    raise exception 'store_item_request not found or not pending: %', p_request_id;
  end if;

  update store_item_requests
    set status = 'approved', approved_by = p_approver_id, approved_at = now()
    where id = p_request_id;

  insert into store_items (title, description, image_url, price, stock, requested_by)
  values (v_title, v_description, v_image_url, p_price, 999999, v_requested_by);
end;
$$;

create or replace function reject_store_item_request(
  p_request_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from store_item_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_id is null then
    raise exception 'store_item_request not found or not pending: %', p_request_id;
  end if;

  update store_item_requests
    set status = 'rejected', approved_by = p_approver_id, approved_at = now()
    where id = p_request_id;
end;
$$;

-- 承認・拒否RPCは、anonキーを持つクライアント（＝子供の端末）から直接 rpc() で
-- 呼べてしまうと、自分の申請を任意価格で承認して store_items カタログに行を注入したり、
-- 他人の申請を拒否したりできる（purchase_store_item より影響範囲が広い）。
-- 承認者（親）の限定チェック・RLSは Phase 2（Supabase Auth連携）で入れる前提だが、
-- それまでの暫定対策として、公開ロールからの EXECUTE 権限は落としておく。
-- Phase 2 で authenticated + 親チェックを通す経路に付け直す。
revoke execute on function approve_store_item_request(uuid, uuid, integer) from public, anon;
revoke execute on function reject_store_item_request(uuid, uuid) from public, anon;

-- 注意（既知の制約・Phase 2で対応予定、Issue #63/#64と同様）:
-- 承認者（親）の限定チェックは関数内では行っていない。Supabase Authと未連携
-- （モックログインのみ）のための一時的な割り切りで、RLS導入（Phase 2）と
-- 合わせて別途対応する。
