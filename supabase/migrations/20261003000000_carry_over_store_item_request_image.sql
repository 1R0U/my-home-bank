-- Issue #311 フォローアップ（PR #334 1R0Uさんレビュー指摘） ---------------------
--
-- 20260927000000_approve_store_item_request.sql の private.approve_store_item_request_unchecked は、
-- store_items.image_url を常に null で作っていた。当時は画像アップロードが未実装で、
-- store_item_requests.image_url が申請した端末内のパス（file://...）のままだったため。
--
-- このPRで画像アップロードを実装し、承認前の store_item_requests.image_url は
-- アップロード後の公開URL（どの端末からも見られる）になった。そのため、承認時に
-- そのまま store_items.image_url へ引き継ぐ。
--
-- 一方、Issue #311より前に申請されたデータは、今も file://... が入ったままの行が
-- 残っている可能性がある（アップロード未実装だった頃の申請。承認待ちのまま残っていた場合）。
-- これをそのまま引き継ぐと、承認後の商品が全端末で壊れた画像URLを持つ行になってしまうため、
-- file://... はこれまでと同じく null にする。
--
-- 適用済みのマイグレーションは書き換えないルールのため、20260927000000を直接編集せず
-- create or replace function で新しいファイルとして追加する（1R0Uさんレビュー指摘）。

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
  v_image_url text;
begin
  if p_price is null or p_price < 1 then
    raise exception '価格は1以上の整数で指定してください';
  end if;

  select title, description, requested_by, family_id, image_url
    into v_title, v_description, v_requested_by, v_family_id, v_image_url
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

  -- 在庫は store_unlimited_stock()（20260905000000_connect_store.sql）で無制限扱いにする。
  -- 値をここへ直接書かないのは、TS側の UNLIMITED_STOCK 定数との食い違いを防ぐため
  -- （tests/sql/treasury_payments_assertions.sql がこの関数の戻り値と突き合わせている）。
  insert into public.store_items (family_id, title, description, image_url, price, stock, requested_by)
  values (
    v_family_id, v_title, v_description,
    case
      when v_image_url is null or v_image_url = '' or v_image_url like 'file://%' then null
      else v_image_url
    end,
    p_price, public.store_unlimited_stock(), v_requested_by
  );
end;
$$;

revoke all on function private.approve_store_item_request_unchecked(uuid, uuid, integer)
from public, anon, authenticated;
