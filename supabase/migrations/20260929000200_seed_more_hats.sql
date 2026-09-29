-- Issue #235: 帽子の種類を増やす（キャップ・おうかん） ---------------------------
--
-- 【なぜ要るか】
-- 20260917000100_seed_starter_wearables.sql と同じ理由。買う仕組みはまだ無く
-- （Issue #225）、持っていないものは着せ替え画面に出ない。
-- 既存の「ぼうし」1種類だけでは着せ替えの選び甲斐が無いため、head枠の選択肢を増やす。
--
-- 【一時的な措置であること】
-- 20260917000100_seed_starter_wearables.sql と同じく、#225 で購入が入るまでのつなぎ。
-- このマイグレーションのあとに増えた利用者には配られない。

insert into public.owned_items (user_id, asset_id)
select u.id, v.asset_id
from public.users u
cross join (values ('wearable-cap'), ('wearable-crown')) as v (asset_id)
on conflict (user_id, asset_id) do nothing;

-- 配れたことを確かめる。利用者が1人もいない新しい環境では何もしない。
do $$
declare
  v_users integer;
  v_missing integer;
begin
  select count(*) into v_users from public.users;
  if v_users = 0 then
    raise notice '利用者がいないため、帽子の追加配布はしていません';
    return;
  end if;

  select count(*) into v_missing
  from public.users u
  cross join (values ('wearable-cap'), ('wearable-crown')) as v (asset_id)
  where not exists (
    select 1 from public.owned_items o
    where o.user_id = u.id and o.asset_id = v.asset_id
  );

  if v_missing > 0 then
    raise exception '帽子を配れていない利用者がいます（%件）', v_missing;
  end if;
  raise notice '利用者 %人に帽子を追加で配りました', v_users;
end;
$$;
