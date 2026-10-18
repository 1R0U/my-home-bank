-- Issue #445: 保存済みの装飾を町のマスへ寄せるマイグレーション（snap_placed_decorations_to_town_grid）を確認する。
--
-- 置けないマスに入る行は止めずに消す（＝しまう）こと、同じ人どうしで重なる組は新しいほうだけ消すこと、
-- 残った行はマスの中心と90度刻みに寄せること、家の中の行は変えないことを見る。
-- マイグレーションは何度流しても結果が同じなので、行を足してからもう一度流して確かめる。
\set ON_ERROR_STOP on
\o /dev/null

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.exists_decoration(p_id uuid)
returns boolean language sql as $$
  select exists (select 1 from public.placed_decorations where id = p_id);
$$;

create function pg_temp.close_to(p_actual numeric, p_expected numeric)
returns boolean language sql as $$
  select abs(p_actual - p_expected) < 0.000001;
$$;

insert into public.families (id, name) values ('44500000-0000-4000-8000-000000000001', '445家庭');
insert into public.users (id, family_id, name, role, balance) values
  ('44500000-0000-4000-8000-000000000011', '44500000-0000-4000-8000-000000000001', '445の子A', 'child', 0),
  ('44500000-0000-4000-8000-000000000012', '44500000-0000-4000-8000-000000000001', '445の子B', 'child', 0);

-- 置くには持っている必要がある（check_decoration_ownership）
insert into public.owned_items (user_id, asset_id, quantity) values
  ('44500000-0000-4000-8000-000000000011', 'decoration-lamp', 5),
  ('44500000-0000-4000-8000-000000000011', 'decoration-grass', 1),
  ('44500000-0000-4000-8000-000000000011', 'decoration-tree', 3),
  ('44500000-0000-4000-8000-000000000012', 'decoration-lamp', 1);

-- マスの番号は lib/rpg-hub/townGrid.ts と同じ（1マス0.9、町の原点が出発地点）。
-- 空いているマス（列29・行0、列35〜38・行5〜6）は、町の固定物の一覧（town_blocked_cells）に無い場所を選んだ
insert into public.placed_decorations (id, user_id, asset_id, position_x, position_z, rotation_y, created_at) values
  -- 町の固定物のマスに入るので消える
  --   出発地点の中央の道（マス 0, 0）
  ('44500000-0000-4000-8000-000000000101', '44500000-0000-4000-8000-000000000011', 'decoration-grass', 0.2, 0.2, 0, '2026-10-01 00:00:00+00'),
  --   銀行の区画の中（区画は列5〜8・行-7〜-4。マス 6, -5）
  ('44500000-0000-4000-8000-000000000102', '44500000-0000-4000-8000-000000000011', 'decoration-lamp', 6.0, -4.3, 0, '2026-10-01 00:00:00+00'),
  --   銀行の扉の前（区画のすぐ北の行-3。マス 6, -3）
  ('44500000-0000-4000-8000-000000000103', '44500000-0000-4000-8000-000000000011', 'decoration-lamp', 5.85, -2.25, 0, '2026-10-01 00:00:00+00'),
  -- 同じ人どうしで同じマス（29, 0）に重なる。古いほうが残り、新しいほうが消える
  ('44500000-0000-4000-8000-000000000104', '44500000-0000-4000-8000-000000000011', 'decoration-lamp', 26.2, 0.3, 1.3, '2026-10-02 00:00:00+00'),
  ('44500000-0000-4000-8000-000000000105', '44500000-0000-4000-8000-000000000011', 'decoration-lamp', 26.5, 0.6, 0, '2026-10-03 00:00:00+00'),
  -- 別の人なら同じマスでも残る（町の中身は人ごとに分かれる）
  ('44500000-0000-4000-8000-000000000106', '44500000-0000-4000-8000-000000000012', 'decoration-lamp', 26.4, 0.4, 0, '2026-10-04 00:00:00+00'),
  -- 2×2 の木が連鎖して重なる: 木1（列35〜36）と木2（列36〜37）、木2と木3（列37〜38）が重なる。
  -- 古い順に決めるので、木2だけが消え、木1と重ならない木3は残る
  ('44500000-0000-4000-8000-000000000107', '44500000-0000-4000-8000-000000000011', 'decoration-tree', 32.5, 5.3, 0, '2026-10-05 00:00:00+00'),
  ('44500000-0000-4000-8000-000000000108', '44500000-0000-4000-8000-000000000011', 'decoration-tree', 33.2, 5.5, 0, '2026-10-06 00:00:00+00'),
  ('44500000-0000-4000-8000-000000000109', '44500000-0000-4000-8000-000000000011', 'decoration-tree', 34.25, 5.35, 0, '2026-10-07 00:00:00+00'),
  -- 家の中（HOUSE_ZONE_BOUNDS）は寄せない
  ('44500000-0000-4000-8000-000000000110', '44500000-0000-4000-8000-000000000011', 'decoration-lamp', 1.23, -75.11, 0.7, '2026-10-08 00:00:00+00');

\ir ../../supabase/migrations/20261017155055_snap_placed_decorations_to_town_grid.sql

-- 町の固定物のマスに入る行 -----------------------------------------------------------------------
select pg_temp.assert(not pg_temp.exists_decoration('44500000-0000-4000-8000-000000000101'), '道の上の装飾は消える（しまう）');
select pg_temp.assert(not pg_temp.exists_decoration('44500000-0000-4000-8000-000000000102'), '建物の区画の中の装飾は消える');
select pg_temp.assert(not pg_temp.exists_decoration('44500000-0000-4000-8000-000000000103'), '建物の扉の前の装飾は消える');

-- 同じ人どうしの重なり ---------------------------------------------------------------------------
select pg_temp.assert(pg_temp.exists_decoration('44500000-0000-4000-8000-000000000104'), '同じマスに重なる2つのうち、古いほうは残る');
select pg_temp.assert(not pg_temp.exists_decoration('44500000-0000-4000-8000-000000000105'), '同じマスに重なる2つのうち、新しいほうだけ消える');
select pg_temp.assert(pg_temp.exists_decoration('44500000-0000-4000-8000-000000000106'), '別の人の装飾は、同じマスでも消えない');
select pg_temp.assert(
  pg_temp.exists_decoration('44500000-0000-4000-8000-000000000107')
    and not pg_temp.exists_decoration('44500000-0000-4000-8000-000000000108')
    and pg_temp.exists_decoration('44500000-0000-4000-8000-000000000109'),
  '連鎖して重なるときは古い順に決まり、残した木と重なる木だけが消える'
);

-- 寄せ方 ----------------------------------------------------------------------------------------
select pg_temp.assert(
  (select pg_temp.close_to(position_x, 26.55) and pg_temp.close_to(position_z, 0.45)
     and pg_temp.close_to(rotation_y, (pi() / 2)::numeric)
   from public.placed_decorations where id = '44500000-0000-4000-8000-000000000104'),
  '1マスの装飾は、マスの中心と90度刻みに寄せる'
);
select pg_temp.assert(
  (select pg_temp.close_to(position_x, 32.4) and pg_temp.close_to(position_z, 5.4) and rotation_y = 0
   from public.placed_decorations where id = '44500000-0000-4000-8000-000000000107'),
  '2×2 の装飾は、4マスの中心に寄せる'
);
select pg_temp.assert(
  (select position_x = 1.23 and position_z = -75.11 and rotation_y = 0.7
   from public.placed_decorations where id = '44500000-0000-4000-8000-000000000110'),
  '家の中の装飾は変えない'
);

-- 持ち物は減らない（しまうのと同じ） -------------------------------------------------------------
select pg_temp.assert(
  (select quantity = 5 from public.owned_items
   where user_id = '44500000-0000-4000-8000-000000000011' and asset_id = 'decoration-lamp'),
  '消した装飾の持ち物は減らない'
);

-- もう一度流しても変わらない ---------------------------------------------------------------------
create temporary table before_again on commit drop as
select id, position_x, position_z, rotation_y from public.placed_decorations
where user_id in ('44500000-0000-4000-8000-000000000011', '44500000-0000-4000-8000-000000000012');

\ir ../../supabase/migrations/20261017155055_snap_placed_decorations_to_town_grid.sql

select pg_temp.assert(
  not exists (
    (select id, position_x, position_z, rotation_y from public.placed_decorations
     where user_id in ('44500000-0000-4000-8000-000000000011', '44500000-0000-4000-8000-000000000012'))
    except
    (select * from before_again)
  )
  and (select count(*) from before_again) = (
    select count(*) from public.placed_decorations
    where user_id in ('44500000-0000-4000-8000-000000000011', '44500000-0000-4000-8000-000000000012')
  ),
  'もう一度流しても、消す行も位置も変わらない'
);

rollback;
