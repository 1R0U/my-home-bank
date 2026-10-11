-- Issue #225: 品書きの中身と、今までの利用者への配布 --------------------------------------------
--
-- 20261011075455_create_shop_items_and_purchase.sql で作った入れ物に、品書きの中身を入れる。
-- 構造の変更と分けるため、別のファイルにしている（AGENTS.md）。
--
-- 【最初から持っている品】
-- - 着せ替え品: 20260917000100・20260929000100・20260929000200 で「購入ができるまでのつなぎ」として
--   配っていた5つ（ぼうし・めがね・キャップ・おうかん・サングラス）。取り上げずに、そのまま最初の品にする
-- - 装飾品: 基本の自然物（しげみ・くさ・たかいくさ・いし・ひらたいいし・き・わかぎ）と、
--   家の中に置くハンガーラック
--
-- 【買う品と値段（基準価格。物価指数を掛けて売る）】
-- タスクの報酬が1件10〜250ゴルほどなので、数件〜十数件こなすと買える値段にしている。
--
-- 【今までの利用者に配るもの】
-- 1. 最初から持っている品（まだ持っていない分）。子供のログインコード（#402）で後から加わった
--    子供など、つなぎの配布より後に増えた利用者にも行き渡らせる
-- 2. すでに庭に置いている装飾の種類。今回から「持っている種類だけ置ける」になるため、
--    置いてあるものが動かせなくなったり、消えたりしないようにする

insert into public.shop_items (asset_id, kind, title, price, is_starter, sort_order) values
  -- 着せ替え品: 最初から持っている
  ('wearable-hat',         'wearable', 'ぼうし',         null, true,  10),
  ('wearable-glasses',     'wearable', 'めがね',         null, true,  20),
  ('wearable-cap',         'wearable', 'キャップ',       null, true,  30),
  ('wearable-crown',       'wearable', 'おうかん',       null, true,  40),
  ('wearable-sunglasses',  'wearable', 'サングラス',     null, true,  50),
  -- 着せ替え品: 買う
  ('wearable-straw-hat',   'wearable', 'むぎわらぼうし', 200,  false, 110),
  ('wearable-knit-hat',    'wearable', 'ニットぼうし',   200,  false, 120),
  ('wearable-santa-hat',   'wearable', 'サンタのぼうし', 300,  false, 130),
  ('wearable-eyepatch',    'wearable', 'がんたい',       150,  false, 140),
  ('wearable-mustache',    'wearable', 'つけひげ',       150,  false, 150),
  -- 装飾品: 最初から持っている
  ('decoration-bush',        'decoration', 'しげみ',         null, true,  10),
  ('decoration-grass',       'decoration', 'くさ',           null, true,  20),
  ('decoration-grass-tall',  'decoration', 'たかいくさ',     null, true,  30),
  ('decoration-rock',        'decoration', 'いし',           null, true,  40),
  ('decoration-rock-flat',   'decoration', 'ひらたいいし',   null, true,  50),
  ('decoration-tree',        'decoration', 'き',             null, true,  60),
  ('decoration-tree-young',  'decoration', 'わかぎ',         null, true,  70),
  ('decoration-hanger-rack', 'decoration', 'ハンガーラック', null, true,  80),
  -- 装飾品: 買う
  ('decoration-grass-flower', 'decoration', 'はなのくさ',       50,  false, 110),
  ('decoration-grass-wide',   'decoration', 'ひろいくさ',       50,  false, 120),
  ('decoration-bush-tall',    'decoration', 'たてながのしげみ', 80,  false, 130),
  ('decoration-bush-wide',    'decoration', 'よこながのしげみ', 80,  false, 140),
  ('decoration-rock-pile',    'decoration', 'いしのやま',       80,  false, 150),
  ('decoration-rock-tall',    'decoration', 'たかいいし',       80,  false, 160),
  ('decoration-bush-berry',   'decoration', 'きのみのしげみ',   100, false, 170),
  ('decoration-tree-pine',    'decoration', 'とがったき',       120, false, 180),
  ('decoration-tree-tall',    'decoration', 'たかいき',         120, false, 190),
  ('decoration-flowerbed',    'decoration', 'かだん',           150, false, 200),
  ('decoration-lamp',         'decoration', 'ランプ',           200, false, 210)
on conflict (asset_id) do nothing;

-- 1. 最初から持っている品を、今いる全員に配る
select private.grant_starter_items(users.id) from public.users;

-- 2. すでに置いている装飾の種類を、持っていることにする
insert into public.owned_items (user_id, asset_id)
select distinct placed_decorations.user_id, placed_decorations.asset_id
from public.placed_decorations
on conflict (user_id, asset_id) do nothing;

-- 配れたことを確かめる。利用者がいない新しい環境では何もしない
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from public.users
  cross join public.shop_items
  where shop_items.is_starter
    and not exists (
      select 1 from public.owned_items
      where owned_items.user_id = users.id and owned_items.asset_id = shop_items.asset_id
    );

  if v_missing > 0 then
    raise exception '最初から持っている品を配れていない利用者がいます（%件）', v_missing;
  end if;

  select count(*) into v_missing
  from public.placed_decorations
  where not exists (
    select 1 from public.owned_items
    where owned_items.user_id = placed_decorations.user_id
      and owned_items.asset_id = placed_decorations.asset_id
  );

  if v_missing > 0 then
    raise exception '置いている装飾のうち、持っていることにできなかったものがあります（%件）', v_missing;
  end if;
end;
$$;
