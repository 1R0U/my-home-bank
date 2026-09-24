-- Issue #222: 最初から持っている着せ替え品を配る --------------------------------
--
-- 【なぜ要るか】
-- アイテムを買う仕組みはまだ無い（Issue #225）。何も持っていないと着せ替え画面が
-- 空になり、保存と反映が動いているかを確かめられない。
--
-- 【一時的な措置であること】
-- #225 でストアから買えるようにしたら、**配る対象を絞るか、この配布をやめる**。
-- ここで配るのは「最初から持っている2つ」であって、全アイテムではない。
--
-- 【このマイグレーションのあとに増えた利用者には配られない】
-- 追いかけて配るトリガは置かない。#225 で購入が入るまでのつなぎなので、
-- 仕組みを増やすより単純に済ませる。必要になったら、そのとき配り直す。
--
-- 構造の変更（テーブル作成）と既存データの補完を混ぜないため、
-- 20260917000000_create_wardrobe.sql とは別のファイルにしてある（AGENTS.md）。

insert into public.owned_items (user_id, asset_id)
select u.id, v.asset_id
from public.users u
cross join (values ('wearable-hat'), ('wearable-glasses')) as v (asset_id)
on conflict (user_id, asset_id) do nothing;

-- 配れたことを確かめる。利用者が1人もいない新しい環境では何もしない。
do $$
declare
  v_users integer;
  v_missing integer;
begin
  select count(*) into v_users from public.users;
  if v_users = 0 then
    raise notice '利用者がいないため、着せ替え品の配布はしていません';
    return;
  end if;

  select count(*) into v_missing
  from public.users u
  cross join (values ('wearable-hat'), ('wearable-glasses')) as v (asset_id)
  where not exists (
    select 1 from public.owned_items o
    where o.user_id = u.id and o.asset_id = v.asset_id
  );

  if v_missing > 0 then
    raise exception '着せ替え品を配れていない利用者がいます（%件）', v_missing;
  end if;
  raise notice '利用者 %人に着せ替え品を配りました', v_users;
end;
$$;
