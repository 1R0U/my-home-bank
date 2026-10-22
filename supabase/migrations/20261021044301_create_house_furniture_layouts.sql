-- Issue #477: 家の中の家具（今はクローゼットだけ）を、かざるの編集モードで動かす・回せるようにする ----
--
-- 【何を保存するか】
-- 家具ごとの「どこに・どの向きで」だけ。見た目・大きさ・使い方（きがえ）はアプリ側の定数
-- （lib/rpg-hub/houseInterior.ts）が持つ。行が無い家具は、アプリの定数の位置（最初の位置）に置く。
--
-- 【placed_decorations に入れない理由】
-- - 家具はストアで買う物ではない。placed_decorations には「持っている数までしか置けない」トリガー
--   （check_decoration_ownership）があり、家具の行は必ず断られる
-- - 家具はしまえない（行を消すと「しまう」と同じ意味になる）。こちらは行を消す権限を渡さない
--
-- 【だれの配置か】
-- 置いた装飾と同じく、配置した人（users.id）ごとに持つ。家族の家を訪ねても、自分の配置で見える
-- （家の中は1つだけの共有の部屋で、持ち主ごとに分かれていないため。Issue #244）。

create table public.house_furniture_layouts (
  user_id uuid not null references public.users (id) on delete cascade,
  -- 家具のオブジェクトID（houseInterior.ts の BACK_WALL_FURNITURE の id）。
  -- 動かせる家具だけを許す。家具を増やすときは、この一覧も増やす
  furniture_id text not null,
  position_x numeric not null,
  position_z numeric not null,
  -- Y軸まわりの回転（ラジアン）。アプリは90度刻み（-π/2, 0, π/2, π）で保存する
  rotation_y numeric not null default 0,
  updated_at timestamptz not null default now(),

  primary key (user_id, furniture_id),
  constraint house_furniture_layouts_furniture_allowed check (furniture_id in ('house-closet')),
  -- between にしているのは、numeric の 'NaN' が「すべての値より大きい」扱いで `>`・`<` をすり抜けるため
  -- （placed_decorations と同じ）。家の中は町から離れた z = -76 付近にあり、この範囲に収まる
  constraint house_furniture_layouts_position_in_range check (
    position_x between -100 and 100 and position_z between -100 and 100
  ),
  constraint house_furniture_layouts_rotation_in_range check (rotation_y between -4 and 4)
);

alter table public.house_furniture_layouts enable row level security;

-- 自分の配置だけを読み書きする。消す権限は渡さない（家具はしまえない）
create policy house_furniture_layouts_select_self on public.house_furniture_layouts
for select to authenticated using (user_id = (select auth.uid()));
create policy house_furniture_layouts_insert_self on public.house_furniture_layouts
for insert to authenticated with check (user_id = (select auth.uid()));
create policy house_furniture_layouts_update_self on public.house_furniture_layouts
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 失効した子供のJWTで読み書きできないようにする（Issue #264 のほかのテーブルと同じ）
create policy house_furniture_layouts_active_child_session on public.house_furniture_layouts as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));

revoke all on table public.house_furniture_layouts from anon, authenticated;
grant select, insert, update on table public.house_furniture_layouts to authenticated;
