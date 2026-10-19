-- 「かざる」で置いた装飾を、町のマスにそろえる（Issue #445）。
--
-- 町を一辺0.9のマスで区切り、置けるかを「占めるマスが空いているか」で決めることにした
-- （lib/rpg-hub/townGrid.ts）。アプリはこれから置く装飾をマスへ寄せて保存するが、これまでに置いた
-- 装飾は自由な座標のまま残っている。そのままだと、同じマスに後から置こうとして「置けない」と出たり、
-- マスの境目にまたがって見えたりする。
--
-- 【対象】町の装飾だけ。家の中（`getHouseLocation` が house になる範囲。下の town_rows で除く）の行は寄せない。
-- 家の中は床の南西の角（x = -6, z = -80）を基準にした別のマスで、家具もまだマスにそろえていない。
-- 家の中のマスへ寄せるのは、家具をマスにそろえるとき（#444 の続き）に改めて行う。
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
-- 【寄せた結果が置けないマスに入る行は消す（＝しまう）】
-- 次の行は、止めずに消す。行を消すのはアプリで「しまう」のと同じで、持ち物（所持数）は減らないので、
-- あとでもう一度置ける（置いた数 ≤ 持っている数 は check_decoration_ownership が見ている）。
-- 前例は 20261017044408_remove_legacy_house_decorations.sql。
--   1. 町の固定物（建物の区画・扉の前の1行・道・町なかの装飾・散らした自然物・町の住人）のマスに入る行。
--      このPRで道の上にも置けなくなり、建物・掲示板・道も動いたため、実データには道の上や建物のそばの
--      装飾がある。固定物はアプリの定数でDBに無いので、占めるマスを下の town_blocked_cells に書き写してある。
--      アプリの `getBlockedCells` で作った一覧と同じであることは tests/townGrid.test.mjs が確かめる。
--      家族のNPC（familyNpcs.ts）は家族ごとに変わるので含めない。
--   2. 同じ人の装飾どうしが同じマスに重なる組の、新しいほう（created_at が新しい。同じなら id が大きい）。
--      3つ以上が連鎖して重なっても結果が一つに決まるよう、古い順に1件ずつ「残した行と重なるなら消す」と決める。
-- AGENTS.md の「既存データが条件を満たさない場合は適用を止める」の例外として扱う（PR #454 で 1R0U が判断）。
-- 止める形だと、本番で1件ずつしか分からず、しまっては流し直すことを繰り返すことになるため。
-- 消した件数と id は raise notice で出す（適用ログに残すため）。
--
-- 同じ値へもう一度寄せても変わらないので、何度適用しても結果は同じ。
-- 片付けと更新は1つの do ブロックで行う。途中で失敗したときに、途中まで片付けた状態を残さないため。

do $$
declare
  candidate record;
  removed_blocked uuid[];
  removed_overlap uuid[] := '{}';
begin
  -- 片付けと update の間に装飾を置かれる・しまわれると、片付けをすり抜けた行まで寄せてしまう。
  -- この do ブロックが終わるまで、ほかからの書き込みを止める。
  -- share row exclusive は自分自身とも衝突するので、2つ同時に流しても片方が待つ
  -- （share だと両方が取れてしまい、update でデッドロックしうる）
  lock table public.placed_decorations in share row exclusive mode;

  -- 町の固定物が占めるマス（南西のマスの列・行と、東西・南北のマスの数）。
  -- lib/rpg-hub/townGrid.ts の getBlockedCells を、町の境界の内側の INITIAL_MAP_OBJECTS に当てたもの
  create temporary view town_blocked_cells as
  select * from (
    values
      ('tasks-building', -9, -7, 4, 4),
      ('tasks-building（扉の前）', -9, -3, 4, 1),
      ('bank-building', 5, -7, 4, 4),
      ('bank-building（扉の前）', 5, -3, 4, 1),
      ('store-building', 5, 5, 4, 4),
      ('store-building（扉の前）', 5, 9, 4, 1),
      ('history-building', -9, 5, 4, 4),
      ('history-building（扉の前）', -9, 9, 4, 1),
      ('house-building', -5, -17, 4, 4),
      ('house-building（扉の前）', -5, -13, 4, 1),
      ('bulletin-board', -5, -7, 4, 4),
      ('bulletin-board（扉の前）', -5, -3, 4, 1),
      ('path-south-0', -9, -3, 2, 2),
      ('path-south-1', -7, -3, 2, 2),
      ('path-south-2', -5, -3, 2, 2),
      ('path-south-3', -3, -3, 2, 2),
      ('path-south-4', -1, -3, 2, 2),
      ('path-south-5', 1, -3, 2, 2),
      ('path-south-6', 3, -3, 2, 2),
      ('path-south-7', 5, -3, 2, 2),
      ('path-south-8', 7, -3, 2, 2),
      ('path-north-0', -9, 9, 2, 2),
      ('path-north-1', -7, 9, 2, 2),
      ('path-north-2', -5, 9, 2, 2),
      ('path-north-3', -3, 9, 2, 2),
      ('path-north-4', -1, 9, 2, 2),
      ('path-north-5', 1, 9, 2, 2),
      ('path-north-6', 3, 9, 2, 2),
      ('path-north-7', 5, 9, 2, 2),
      ('path-north-8', 7, 9, 2, 2),
      ('path-center-0', -1, -1, 2, 2),
      ('path-center-1', -1, 1, 2, 2),
      ('path-center-2', -1, 3, 2, 2),
      ('path-center-3', -1, 5, 2, 2),
      ('path-center-4', -1, 7, 2, 2),
      ('path-out-north-0', -1, 11, 2, 2),
      ('path-out-north-1', -1, 13, 2, 2),
      ('path-out-north-2', -1, 15, 2, 2),
      ('path-out-north-3', 1, 15, 2, 2),
      ('path-out-north-4', 3, 15, 2, 2),
      ('path-out-north-5', 3, 17, 2, 2),
      ('path-out-north-6', 3, 19, 2, 2),
      ('path-out-south-0', -1, -5, 2, 2),
      ('path-out-south-1', -1, -7, 2, 2),
      ('path-out-south-2', -1, -9, 2, 2),
      ('path-out-south-3', -3, -9, 2, 2),
      ('path-out-south-4', -3, -11, 2, 2),
      ('path-out-south-5', -3, -13, 2, 2),
      ('path-out-south-6', -5, -13, 2, 2),
      ('path-out-east-0', 9, -3, 2, 2),
      ('path-out-east-1', 11, -3, 2, 2),
      ('path-out-east-2', 13, -3, 2, 2),
      ('path-out-east-3', 13, -1, 2, 2),
      ('path-out-east-4', 13, 1, 2, 2),
      ('path-out-east-5', 13, 3, 2, 2),
      ('path-out-west-0', -11, 9, 2, 2),
      ('path-out-west-1', -13, 9, 2, 2),
      ('path-out-west-2', -15, 9, 2, 2),
      ('path-out-west-3', -15, 7, 2, 2),
      ('path-out-west-4', -15, 5, 2, 2),
      ('lamp-southwest', -4, -1, 1, 1),
      ('lamp-southeast', 4, -1, 1, 1),
      ('lamp-northwest', -4, 8, 1, 1),
      ('lamp-northeast', 3, 8, 1, 1),
      ('lamp-center-east', 1, 3, 1, 1),
      ('lamp-center-west', -2, 6, 1, 1),
      ('flowerbed-plaza-east', 2, 1, 2, 2),
      ('flowerbed-plaza-west', -4, 1, 2, 2),
      ('flowerbed-store-side', 2, 4, 2, 2),
      ('flowerbed-history-side', -4, 4, 2, 2),
      ('bush-south-west', -3, -1, 2, 2),
      ('bush-south-east', 2, -1, 2, 2),
      ('bush-road-west-end', -9, -1, 2, 2),
      ('bush-road-east-end', 8, -1, 2, 2),
      ('bush-north-west-end', -12, 7, 2, 2),
      ('bush-north-east-end', 10, 8, 2, 2),
      ('bush-north-back-west', -3, 12, 2, 2),
      ('bush-north-back-east', 1, 11, 2, 2),
      ('bush-far-west', -9, 3, 2, 2),
      ('bush-far-east', 8, 3, 2, 2),
      ('tree-store-front', 2, 6, 2, 2),
      ('tree-north', -4, 14, 2, 2),
      ('tree-south', 1, -10, 2, 2),
      ('tree-west', -11, 1, 2, 2),
      ('tree-east', 9, 1, 2, 2),
      ('tree-southeast', 11, -10, 2, 2),
      ('tree-southwest', -12, -9, 2, 2),
      ('tree-tasks-side', -6, -10, 2, 2),
      ('tree-bank-side', 3, -8, 2, 2),
      ('tree-far-north', -9, 12, 2, 2),
      ('tree-far-southeast', 8, -13, 2, 2),
      ('tree-far-northwest', -17, 6, 2, 2),
      ('npc-guide', -2, 3, 2, 2),
      ('npc-shopkeeper', 5, 11, 2, 2),
      ('grass-plaza-north', 1, 5, 1, 1),
      ('grass-plaza-south', -2, 2, 1, 1),
      ('grass-road-south-west', -5, -1, 1, 1),
      ('grass-road-south-east', 5, -1, 1, 1),
      ('grass-road-north-west', -3, 8, 1, 1),
      ('grass-road-north-east', 2, 8, 1, 1),
      ('grass-tasks-side', -5, -8, 1, 1),
      ('grass-bank-side', 3, -4, 1, 1),
      ('grass-west', -11, 3, 1, 1),
      ('grass-east', 8, 1, 1, 1),
      ('grass-far-north', -4, 12, 1, 1),
      ('grass-far-south', 2, -11, 1, 1),
      ('rock-northwest', -11, 4, 2, 2),
      ('rock-northeast', 10, 5, 2, 2),
      ('rock-southwest', -10, -11, 2, 2),
      ('rock-far-north', 9, 12, 2, 2),
      ('rock-far-west', -13, -4, 2, 2),
      ('rock-far-east', 16, -3, 2, 2),
      ('scatter-0-62', -29, -38, 2, 2),
      ('scatter-0-61', -32, 25, 2, 2),
      ('scatter-0-60', -29, 27, 2, 2),
      ('scatter-0-59', -27, -23, 2, 2),
      ('scatter-0-58', -35, -6, 2, 2),
      ('scatter-0-57', -37, -34, 2, 2),
      ('scatter-0-56', 34, 25, 2, 2),
      ('scatter-0-55', 14, 19, 2, 2),
      ('scatter-0-54', -35, 9, 2, 2),
      ('scatter-0-53', 9, 21, 2, 2),
      ('scatter-0-52', 9, -28, 2, 2),
      ('scatter-0-51', -9, 23, 2, 2),
      ('scatter-0-50', -32, -14, 2, 2),
      ('scatter-0-49', 14, -22, 2, 2),
      ('scatter-0-48', -7, 35, 2, 2),
      ('scatter-0-47', -28, -27, 2, 2),
      ('scatter-0-46', -26, -17, 2, 2),
      ('scatter-0-45', 18, -12, 2, 2),
      ('scatter-0-44', 21, 21, 2, 2),
      ('scatter-0-43', 30, 35, 2, 2),
      ('scatter-0-42', -3, -35, 2, 2),
      ('scatter-0-41', 4, -36, 2, 2),
      ('scatter-0-40', -37, 15, 2, 2),
      ('scatter-0-39', 34, -10, 2, 2),
      ('scatter-0-38', -13, 25, 2, 2),
      ('scatter-0-37', -31, 8, 2, 2),
      ('scatter-0-36', 23, 14, 2, 2),
      ('scatter-0-35', 28, -26, 2, 2),
      ('scatter-0-34', 20, -34, 2, 2),
      ('scatter-0-33', -35, 23, 2, 2),
      ('scatter-0-32', 1, -28, 2, 2),
      ('scatter-0-31', -6, -20, 2, 2),
      ('scatter-0-30', -26, -7, 2, 2),
      ('scatter-0-29', -4, 31, 2, 2),
      ('scatter-0-28', 22, -10, 2, 2),
      ('scatter-0-27', -11, -37, 2, 2),
      ('scatter-0-26', 23, -13, 2, 2),
      ('scatter-0-25', -15, -29, 2, 2),
      ('scatter-0-24', -26, -31, 2, 2),
      ('scatter-0-23', -33, -23, 2, 2),
      ('scatter-0-22', -12, 17, 2, 2),
      ('scatter-0-21', 6, 30, 2, 2),
      ('scatter-0-20', -23, 28, 2, 2),
      ('scatter-0-19', -8, 17, 2, 2),
      ('scatter-0-18', -17, -14, 2, 2),
      ('scatter-0-17', -23, 35, 2, 2),
      ('scatter-0-16', 18, 20, 2, 2),
      ('scatter-0-15', -38, -10, 2, 2),
      ('scatter-0-14', -26, 23, 2, 2),
      ('scatter-0-13', -1, 35, 2, 2),
      ('scatter-0-12', 2, -25, 2, 2),
      ('scatter-0-11', 1, -19, 2, 2),
      ('scatter-0-10', 29, 22, 2, 2),
      ('scatter-0-9', -23, -26, 2, 2),
      ('scatter-0-8', 19, -9, 2, 2),
      ('scatter-0-7', -6, -26, 2, 2),
      ('scatter-0-6', 11, -35, 2, 2),
      ('scatter-0-5', -22, -32, 2, 2),
      ('scatter-0-4', 12, -29, 2, 2),
      ('scatter-0-3', 20, 36, 2, 2),
      ('scatter-0-2', -38, -17, 2, 2),
      ('scatter-0-1', -9, 32, 2, 2),
      ('scatter-1-46', -25, 5, 2, 2),
      ('scatter-1-45', -12, -30, 2, 2),
      ('scatter-1-44', 31, -34, 2, 2),
      ('scatter-1-43', -21, -15, 2, 2),
      ('scatter-1-42', -37, -14, 2, 2),
      ('scatter-1-41', -16, 16, 2, 2),
      ('scatter-1-40', 21, 24, 2, 2),
      ('scatter-1-39', -27, 16, 2, 2),
      ('scatter-1-38', -22, -8, 2, 2),
      ('scatter-1-37', 32, 15, 2, 2),
      ('scatter-1-36', 30, -21, 2, 2),
      ('scatter-1-35', -24, -20, 2, 2),
      ('scatter-1-34', 26, -30, 2, 2),
      ('scatter-1-33', -10, 35, 2, 2),
      ('scatter-1-32', -3, -38, 2, 2),
      ('scatter-1-31', 36, 31, 2, 2),
      ('scatter-1-30', 21, 11, 2, 2),
      ('scatter-1-29', -37, -27, 2, 2),
      ('scatter-1-28', -18, 27, 2, 2),
      ('scatter-1-27', 21, -29, 2, 2),
      ('scatter-1-26', -32, 21, 2, 2),
      ('scatter-1-25', 15, -19, 2, 2),
      ('scatter-1-24', 21, 17, 2, 2),
      ('scatter-1-23', 10, 36, 2, 2),
      ('scatter-1-22', 22, -25, 2, 2),
      ('scatter-1-21', -4, 35, 2, 2),
      ('scatter-1-20', 36, 16, 2, 2),
      ('scatter-1-19', 28, -33, 2, 2),
      ('scatter-1-18', -16, -35, 2, 2),
      ('scatter-1-17', -21, 0, 2, 2),
      ('scatter-1-16', 31, 9, 2, 2),
      ('scatter-1-15', -5, -31, 2, 2),
      ('scatter-1-14', 36, -16, 2, 2),
      ('scatter-1-13', -37, 26, 2, 2),
      ('scatter-1-12', -13, 35, 2, 2),
      ('scatter-1-11', -29, 33, 2, 2),
      ('scatter-1-10', 32, 5, 2, 2),
      ('scatter-1-9', -31, -30, 2, 2),
      ('scatter-1-8', -26, 26, 2, 2),
      ('scatter-1-7', 31, 27, 2, 2),
      ('scatter-1-6', 16, 2, 2, 2),
      ('scatter-1-5', -29, -1, 2, 2),
      ('scatter-1-4', -18, 9, 2, 2),
      ('scatter-1-3', -36, 12, 2, 2),
      ('scatter-1-2', 22, -17, 2, 2),
      ('scatter-1-1', -18, 34, 2, 2),
      ('scatter-2-34', 36, 36, 2, 2),
      ('scatter-2-33', 31, -13, 2, 2),
      ('scatter-2-32', 24, 33, 2, 2),
      ('scatter-2-31', -16, -21, 2, 2),
      ('scatter-2-30', 33, 34, 2, 2),
      ('scatter-2-29', 24, 20, 2, 2),
      ('scatter-2-28', 11, -23, 2, 2),
      ('scatter-2-27', 27, 33, 2, 2),
      ('scatter-2-26', 34, -32, 2, 2),
      ('scatter-2-25', -21, -3, 2, 2),
      ('scatter-2-24', -26, 31, 2, 2),
      ('scatter-2-23', 7, -25, 2, 2),
      ('scatter-2-22', 34, -24, 2, 2),
      ('scatter-2-21', -1, -24, 2, 2),
      ('scatter-2-20', -27, -12, 2, 2),
      ('scatter-2-19', -21, -12, 2, 2),
      ('scatter-2-18', -21, 15, 2, 2),
      ('scatter-2-17', 19, 7, 2, 2),
      ('scatter-2-16', -12, 30, 2, 2),
      ('scatter-2-15', 27, 3, 2, 2),
      ('scatter-2-14', -35, 19, 2, 2),
      ('scatter-2-13', 14, -33, 2, 2),
      ('scatter-2-12', 35, 21, 2, 2),
      ('scatter-2-11', 22, 4, 2, 2),
      ('scatter-2-10', 16, 13, 2, 2),
      ('scatter-2-9', 8, -19, 2, 2),
      ('scatter-2-8', -8, -31, 2, 2),
      ('scatter-2-7', 26, 24, 2, 2),
      ('scatter-2-6', 26, -2, 2, 2),
      ('scatter-2-5', 23, 29, 2, 2),
      ('scatter-2-4', -33, 30, 2, 2),
      ('scatter-2-3', -26, 0, 2, 2),
      ('scatter-2-2', -13, -18, 2, 2),
      ('scatter-2-1', -26, -35, 2, 2),
      ('scatter-3-58', -37, 22, 1, 1),
      ('scatter-3-57', -36, -21, 1, 1),
      ('scatter-3-56', -37, 34, 1, 1),
      ('scatter-3-55', 14, -12, 1, 1),
      ('scatter-3-54', 21, -21, 1, 1),
      ('scatter-3-53', 4, -29, 1, 1),
      ('scatter-3-52', 23, 0, 1, 1),
      ('scatter-3-51', 2, 31, 1, 1),
      ('scatter-3-50', 37, -21, 1, 1),
      ('scatter-3-49', 30, -28, 1, 1),
      ('scatter-3-48', 10, -37, 1, 1),
      ('scatter-3-47', 26, -7, 1, 1),
      ('scatter-3-46', 7, -28, 1, 1),
      ('scatter-3-45', -34, -18, 1, 1),
      ('scatter-3-44', 26, 1, 1, 1),
      ('scatter-3-43', 16, -36, 1, 1),
      ('scatter-3-42', -3, 18, 1, 1),
      ('scatter-3-41', -5, 18, 1, 1),
      ('scatter-3-40', 28, -14, 1, 1),
      ('scatter-3-39', 35, -6, 1, 1),
      ('scatter-3-38', 18, 37, 1, 1),
      ('scatter-3-37', 16, -15, 1, 1),
      ('scatter-3-36', 21, -38, 1, 1),
      ('scatter-3-35', -32, -7, 1, 1),
      ('scatter-3-34', 1, 22, 1, 1),
      ('scatter-3-33', -18, 1, 1, 1),
      ('scatter-3-32', 8, -22, 1, 1),
      ('scatter-3-31', -38, -19, 1, 1),
      ('scatter-3-30', 31, -4, 1, 1),
      ('scatter-3-29', -23, -15, 1, 1),
      ('scatter-3-28', -1, -21, 1, 1),
      ('scatter-3-27', 11, -19, 1, 1),
      ('scatter-3-26', -22, 8, 1, 1),
      ('scatter-3-25', 6, 17, 1, 1),
      ('scatter-3-24', 17, -23, 1, 1),
      ('scatter-3-23', -1, 27, 1, 1),
      ('scatter-3-22', 26, -4, 1, 1),
      ('scatter-3-21', 20, -25, 1, 1),
      ('scatter-3-20', 24, -38, 1, 1),
      ('scatter-3-19', -22, 33, 1, 1),
      ('scatter-3-18', 12, 20, 1, 1),
      ('scatter-3-17', 33, 12, 1, 1),
      ('scatter-3-16', -18, 14, 1, 1),
      ('scatter-3-15', -6, 24, 1, 1),
      ('scatter-3-14', 35, 19, 1, 1),
      ('scatter-3-13', 35, 9, 1, 1),
      ('scatter-3-12', 27, 8, 1, 1),
      ('scatter-3-11', 37, -1, 1, 1),
      ('scatter-3-10', 18, -14, 1, 1),
      ('scatter-3-9', 13, 35, 1, 1),
      ('scatter-3-8', 24, -22, 1, 1),
      ('scatter-3-7', -29, 16, 1, 1),
      ('scatter-3-6', 18, 23, 1, 1),
      ('scatter-3-5', 14, 33, 1, 1),
      ('scatter-3-4', 33, 20, 1, 1),
      ('scatter-3-3', 18, -31, 1, 1),
      ('scatter-3-2', 37, 28, 1, 1),
      ('scatter-3-1', -11, 23, 1, 1)
  ) as cells(object_id, col, row_index, cols, rows);

  -- 寄せた先を求める（下の update でも同じ式を使う）
  create temporary view snapped_placed_decorations as
  with town_rows as (
    -- 家の中（lib/rpg-hub/houseInterior.ts の HOUSE_ZONE_BOUNDS。境界を含む）は対象外
    select id, user_id, asset_id, position_x, position_z, rotation_y, created_at
    from public.placed_decorations
    where not (
      position_x between -6.3 and 6.3
      and position_z between -80.3 and -69.9
    )
  ),
  sized as (
    select
      id,
      user_id,
      created_at,
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
    from town_rows
  ),
  cells as (
    select
      id,
      user_id,
      created_at,
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
    created_at,
    cells,
    col,
    row_index,
    (col + cells / 2.0) * 0.9 as snapped_x,
    (row_index + cells / 2.0) * 0.9 as snapped_z,
    (case when quarters = 3 then -1 else quarters end) * (pi() / 2)::numeric as snapped_rotation_y
  from cells;

  -- 1. 町の固定物のマス（建物の区画・扉の前・道・町なかの装飾など）に入る行を消す
  select coalesce(array_agg(distinct s.id), '{}')
    into removed_blocked
  from snapped_placed_decorations s
  join town_blocked_cells t
    on s.col < t.col + t.cols
   and t.col < s.col + s.cells
   and s.row_index < t.row_index + t.rows
   and t.row_index < s.row_index + s.cells;

  delete from public.placed_decorations where id = any (removed_blocked);
  raise notice '町の固定物のマスに入る装飾をしまいました: % 件 %', cardinality(removed_blocked), removed_blocked;

  -- 2. 同じ人の装飾どうしが重なる組は、古い順に見て、残した行と重なる行を消す。
  -- 占めるマスの範囲（col 〜 col + cells - 1）が縦横とも重なれば重なりとみなす
  create temporary table kept_snapped_cells (user_id uuid, col numeric, row_index numeric, cells integer);
  for candidate in
    select * from snapped_placed_decorations order by user_id, created_at, id
  loop
    if exists (
      select 1 from kept_snapped_cells k
      where k.user_id = candidate.user_id
        and k.col < candidate.col + candidate.cells
        and candidate.col < k.col + k.cells
        and k.row_index < candidate.row_index + candidate.cells
        and candidate.row_index < k.row_index + k.cells
    ) then
      removed_overlap := removed_overlap || candidate.id;
    else
      insert into kept_snapped_cells values (candidate.user_id, candidate.col, candidate.row_index, candidate.cells);
    end if;
  end loop;
  drop table kept_snapped_cells;

  delete from public.placed_decorations where id = any (removed_overlap);
  raise notice '同じ人の装飾と同じマスに重なる装飾（新しいほう）をしまいました: % 件 %', cardinality(removed_overlap), removed_overlap;

  -- 3. 残った行だけを寄せる
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
  drop view town_blocked_cells;
end $$;
