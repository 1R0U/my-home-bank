-- 「かざる」で置いた装飾を、町のマスにそろえる（Issue #445）。
--
-- 町を一辺0.9のマスで区切り、装飾は1マスに1つずつ置くことにした（lib/rpg-hub/townGrid.ts）。
-- アプリはこれから置く装飾をマスへ寄せて保存するが、これまでに置いた装飾は自由な座標のまま残っている。
-- そのままだと、同じマスに後から置こうとして「置けない」と出たり、マスの境目にまたがって見えたりする。
--
-- 【寄せ方】アプリの townGrid.ts の `snapToCells` / `snapRotationToQuarter` と同じ。
--   - 位置: 占めるマスの数（一辺）を cells として、
--       南西のマスの列 = floor(x / 0.9 - cells / 2 + 0.5)、中心 = (列 + cells / 2) × 0.9（z も同じ）。
--     cells は lib/rpg-hub/catalog.ts の placement.cells と同じ。しげみ・岩・木・花壇は2（2×2 マス）、
--     ほかは1。下の一覧とカタログがずれていないことは tests/townGrid.test.mjs が確かめる。
--     アプリ側の Math.round(v) は floor(v + 0.5) と同じなので、SQLでもそう書く
--     （SQLの round は 0.5 を0から遠い側へ丸め、負の値で寄り方がずれるため使わない）。
--   - 向き: いちばん近い90度刻み（0, π/2, π, -π/2）。斜めにすると当たり判定が1マスからはみ出す。
--
-- 【寄せた結果、同じ人の装飾が同じマスに重なるときは止める】
-- どちらを動かすかは推測で決めない（AGENTS.md「既存データが条件を満たさない場合は適用を止める」）。
-- 町の中身は人ごとに分かれるので（placed_decorations.user_id）、重なりは同じ人どうしで調べる。
-- 止まったときは、該当の装飾をアプリで「しまう」か、担当者と対応を決めてから適用し直す。
--
-- 【調べないこと】建物・道・町の固定の装飾はアプリの定数で、DBに無い。寄せた先がそれらと
-- 重なるかはここでは調べられない。重なっても、アプリで「しまう」ことはできる。
--
-- 同じ値へもう一度寄せても変わらないので、何度適用しても結果は同じ。
-- 検査と更新は1つの do ブロックで行う。止めたときに、途中まで寄せた状態を残さないため。

do $$
declare
  conflict record;
begin
  -- 寄せた先を求める（下の update でも同じ式を使う）
  create temporary view snapped_placed_decorations as
  with sized as (
    select
      id,
      user_id,
      position_x,
      position_z,
      rotation_y,
      case
        when asset_id in (
          'decoration-bush',
          'decoration-bush-berry',
          'decoration-bush-tall',
          'decoration-bush-wide',
          'decoration-flowerbed',
          'decoration-rock',
          'decoration-rock-flat',
          'decoration-rock-pile',
          'decoration-rock-tall',
          'decoration-tree',
          'decoration-tree-pine',
          'decoration-tree-tall',
          'decoration-tree-young'
        ) then 2
        else 1
      end as cells
    from public.placed_decorations
  ),
  cells as (
    select
      id,
      user_id,
      cells,
      floor(position_x / 0.9 - cells / 2.0 + 0.5 + 0.000001) as col,
      floor(position_z / 0.9 - cells / 2.0 + 0.5 + 0.000001) as row_index,
      -- 0〜3（90度を何回まわすか）
      mod(mod(floor(rotation_y / (pi() / 2)::numeric + 0.5), 4) + 4, 4) as quarters
    from sized
  )
  select
    id,
    user_id,
    cells,
    col,
    row_index,
    (col + cells / 2.0) * 0.9 as snapped_x,
    (row_index + cells / 2.0) * 0.9 as snapped_z,
    (case when quarters = 3 then -1 else quarters end) * (pi() / 2)::numeric as snapped_rotation_y
  from cells;

  -- 占めるマスの範囲（col 〜 col + cells - 1）が、縦横とも重なる組を探す
  select a.user_id, a.id as first_id, b.id as second_id, a.col, a.row_index
    into conflict
  from snapped_placed_decorations a
  join snapped_placed_decorations b
    on a.user_id = b.user_id
   and a.id < b.id
   and a.col < b.col + b.cells
   and b.col < a.col + a.cells
   and a.row_index < b.row_index + b.cells
   and b.row_index < a.row_index + a.cells
  limit 1;

  if found then
    raise exception
      'マスへ寄せると同じ人の装飾が同じマスに重なります（user_id: %, 装飾: % と %, マス: %, %）。どちらを動かすかを決めてから適用し直してください',
      conflict.user_id, conflict.first_id, conflict.second_id, conflict.col, conflict.row_index;
  end if;

  update public.placed_decorations as decorations
  set
    position_x = snapped.snapped_x,
    position_z = snapped.snapped_z,
    rotation_y = snapped.snapped_rotation_y
  from snapped_placed_decorations as snapped
  where decorations.id = snapped.id
    and (
      decorations.position_x is distinct from snapped.snapped_x
      or decorations.position_z is distinct from snapped.snapped_z
      or decorations.rotation_y is distinct from snapped.snapped_rotation_y
    );

  -- 一時ビューはこのセッションの終わりまで残るので、ここで片付ける
  drop view snapped_placed_decorations;
end $$;
