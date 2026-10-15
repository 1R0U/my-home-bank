-- Issue #244: 家ごとの内装（もようがえ）を、端末内（AsyncStorage）ではなくDBに保存し、
-- 他の家族からも見られるようにする -----------------------------------------------
--
-- 【何を保存するか】
-- lib/rpg-hub/houseLayout.ts の HouseLayout と1:1。クローゼットの位置（closet_x）と、
-- 置いた家具の一覧（placed）。家具は種類ごとに1つで最大5件の小さな配列のため、
-- 行を分けずJSONBでそのまま持つ（見た目・形はアプリ側のカタログが持ち、DBには位置だけ）。
--
-- 【1人1行】
-- character_appearances と同じ形。user_id を主キーにする。
--
-- 【読み取りを家族まで広げる理由】
-- 他の家族の家に入って内装を見られるようにするため（編集は本人のみ）。
-- 20261011112204_allow_family_read_character_look.sql と同じ考え方で、
-- 書き込み（insert/update/delete）は本人のまま変えない。

create table if not exists public.house_layouts (
  user_id uuid primary key references public.users (id) on delete cascade,
  closet_x numeric not null default 0.27,
  placed jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),

  constraint house_layouts_closet_x_in_range check (closet_x between 0 and 1)
);

alter table public.house_layouts enable row level security;

create policy house_layouts_select_self on public.house_layouts
  for select to authenticated using (user_id = auth.uid());

create policy house_layouts_select_family on public.house_layouts
  for select to authenticated using (
    exists (
      select 1 from public.users u
      where u.id = house_layouts.user_id
        and u.family_id = public.current_user_family_id()
    )
  );

create policy house_layouts_insert_self on public.house_layouts
  for insert to authenticated with check (user_id = auth.uid());

create policy house_layouts_update_self on public.house_layouts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 失効した子供のJWTからの読み書きを止める（AGENTS.md: publicにRLS付きテーブルを追加したら必須）
create policy house_layouts_active_child_session on public.house_layouts
  as restrictive for all to authenticated
  using ((select public.current_child_session_is_valid()))
  with check ((select public.current_child_session_is_valid()));

revoke all on table public.house_layouts from anon, authenticated;
-- character_appearances / placed_decorations と同じ、列制限が不要な素直な自分専用データの形
grant select, insert, update on table public.house_layouts to authenticated;
