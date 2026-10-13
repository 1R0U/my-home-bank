-- Issue #225: 決済台帳の作成と所有の付与を同じトランザクションにする。
-- 既存の決済RPC・冪等キー・金庫送金を再利用し、台帳が新規作成されたときだけ付与する。
create function private.grant_purchased_store_asset()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_asset_id text; v_kind text;
begin
  select i.asset_id, a.kind into v_asset_id, v_kind
  from public.store_items i left join public.store_assets a on a.asset_id = i.asset_id
  where i.id = new.related_id;
  if v_asset_id is null then return new; end if;
  if v_kind = 'wearable' then
    insert into public.owned_items(user_id, asset_id, quantity)
    values (new.actor_user_id, v_asset_id, 1) on conflict (user_id, asset_id) do nothing;
    if not found then raise exception using errcode = 'P0225', message = 'この着せ替え品はすでに持っています'; end if;
  elsif v_kind = 'decoration' then
    insert into public.owned_items(user_id, asset_id, quantity)
    values (new.actor_user_id, v_asset_id, 1)
    on conflict (user_id, asset_id) do update set quantity = owned_items.quantity + 1;
  else
    raise exception '販売するアセットの種別が不正です';
  end if;
  return new;
end; $$;
revoke all on function private.grant_purchased_store_asset() from public, anon, authenticated;
create trigger grant_purchased_store_asset after insert on public.economy_transactions
for each row when (new.type = 'store_purchase' and new.related_type = 'store_item')
execute function private.grant_purchased_store_asset();

-- 同じ所有行をロックして、別端末から同時に置いても所有数を超えないよう直列化する。
create function private.check_decoration_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_quantity integer; v_placed integer;
begin
  select o.quantity into v_quantity from public.owned_items o
  join public.store_assets a on a.asset_id = o.asset_id and a.kind = 'decoration'
  where o.user_id = new.user_id and o.asset_id = new.asset_id for update of o;
  if not found then raise exception 'このかざりを持っていません。ストアで買ってください'; end if;
  select count(*) into v_placed from public.placed_decorations
  where user_id = new.user_id and asset_id = new.asset_id and id <> new.id;
  if v_placed >= v_quantity then raise exception 'このかざりはすべて配置済みです'; end if;
  return new;
end; $$;
revoke all on function private.check_decoration_ownership() from public, anon, authenticated;
create trigger check_decoration_ownership before insert or update on public.placed_decorations
for each row execute function private.check_decoration_ownership();

-- 所有数は本人だけに返す。商品が無い場合も従来どおり物価指数を返す。
create or replace function public.get_current_store_catalog()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snapshot public.economy_monthly_snapshots%rowtype; v_items jsonb;
begin
  perform public.check_child_session();
  select * into v_snapshot from public.get_or_create_monthly_price_index();
  select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object(
    'base_price', i.price, 'price_index', v_snapshot.price_index,
    'sale_price', private.store_sale_price(i.price, v_snapshot.price_index),
    'asset_kind', a.kind, 'owned_quantity', coalesce(o.quantity, 0)
  ) order by i.created_at desc), '[]'::jsonb) into v_items
  from public.store_items i
  left join public.store_assets a on a.asset_id = i.asset_id
  left join public.owned_items o on o.asset_id = i.asset_id and o.user_id = auth.uid()
  where i.family_id = v_snapshot.family_id and i.is_active;
  return jsonb_build_object('price_index', v_snapshot.price_index, 'items', v_items);
end; $$;
