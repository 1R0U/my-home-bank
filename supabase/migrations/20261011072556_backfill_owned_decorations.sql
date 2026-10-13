-- Issue #225: 無料で配置できた既存の装飾は、その配置数を所有として引き継ぐ。
-- 未知のアセットを推測で置換しない。先にカタログとの不一致を解消してから適用する。
do $$ begin
  if exists (
    select 1 from public.placed_decorations p
    left join public.store_assets a on a.asset_id = p.asset_id and a.kind = 'decoration'
    where a.asset_id is null
  ) then raise exception 'カタログにない配置済み装飾があります。適用を止めて確認してください'; end if;
end; $$;

insert into public.owned_items(user_id, asset_id, quantity)
select user_id, asset_id, count(*)::integer from public.placed_decorations group by user_id, asset_id
on conflict (user_id, asset_id) do update set quantity = greatest(owned_items.quantity, excluded.quantity);
