-- Issue #506: 家の中に最初からあるソファ・植木も、かざるの編集モードで動かす・回す・しまうことができるようにする ----
--
-- 【何を足すか】
-- 1. ソファ・植木の装飾（decoration-sofa・decoration-big-plant）を販売するアセットに足す。
--    しまったソファ・植木は、この装飾として持ち物に入り、あとで「かざる」から置ける。
--    ほかの装飾と同じくストアにも並ぶ（既存の家庭へ並べるのは次のマイグレーション）
-- 2. 動かせる家具の一覧 house_furniture_items。しまえる家具には、しまったときに持ち物へ足すアセットを持たせる
--    （クローゼットはきがえに使うので、しまえない）
-- 3. house_furniture_layouts に「しまったか」（stored）を足し、家具のidを 2. の一覧に絞る
-- 4. 家具をしまう関数 store_house_furniture
--
-- 【しまう操作をサーバーの関数にする理由】
-- しまうと持ち物（owned_items）が1つ増える。アプリが owned_items へ直接書けると、好きなアセットを増やせてしまう。
-- そこで、しまえる家具と足すアセットの対応をDB（house_furniture_items）に持ち、関数だけが stored と持ち物を変える。
-- 同じ家具を2回しまっても、持ち物は1つしか増えない（stored が false → true に変わったときだけ足す）。
-- しまった家具を元に戻す操作は無い（持ち物に入った装飾を「かざる」から置く）。

-- 1. 販売するアセット。名前はアプリのカタログ（lib/rpg-hub/catalog.ts）と同じ
insert into public.store_assets(asset_id, kind, display_name) values
('decoration-sofa', 'decoration', 'ソファ'),
('decoration-big-plant', 'decoration', 'おおきなうえき');

-- 2. 動かせる家具。家具のidはアプリの定数（lib/rpg-hub/houseFurniture.ts の MOVABLE_FURNITURE_IDS）と同じにする
create table public.house_furniture_items (
  furniture_id text primary key,
  -- しまったときに持ち物へ足す装飾。NULL はしまえない家具
  stored_asset_id text references public.store_assets (asset_id)
);

insert into public.house_furniture_items(furniture_id, stored_asset_id) values
('house-closet', null),
('house-sofa', 'decoration-sofa'),
('house-plant', 'decoration-big-plant');

alter table public.house_furniture_items enable row level security;
create policy house_furniture_items_select_authenticated on public.house_furniture_items
for select to authenticated using (true);
create policy house_furniture_items_active_child_session on public.house_furniture_items as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));
revoke all on table public.house_furniture_items from anon, authenticated;
grant select on table public.house_furniture_items to authenticated;

-- 3. しまったか。しまった家具は、位置の列があっても家の中に出さない
alter table public.house_furniture_layouts add column stored boolean not null default false;

-- 家具のidの許可リストを、check 制約から 2. の一覧への外部キーに替える（家具を増やすときは一覧に足すだけでよい）。
-- 今ある行は house-closet だけなので、一覧に必ず含まれる
alter table public.house_furniture_layouts add constraint house_furniture_layouts_furniture_id_fkey
  foreign key (furniture_id) references public.house_furniture_items (furniture_id);
alter table public.house_furniture_layouts drop constraint house_furniture_layouts_furniture_allowed;

-- stored はアプリから書けないようにする（しまう関数だけが変える）。
-- upsert は ON CONFLICT DO UPDATE で送った列すべてを書き換えるので、主キーの列にも update の権限を渡す
revoke insert, update on table public.house_furniture_layouts from authenticated;
grant insert (user_id, furniture_id, position_x, position_z, rotation_y, updated_at)
  on table public.house_furniture_layouts to authenticated;
grant update (user_id, furniture_id, position_x, position_z, rotation_y, updated_at)
  on table public.house_furniture_layouts to authenticated;

-- 4. 家具をしまう
create function public.store_house_furniture(p_furniture_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_asset_id text;
  v_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;
  perform public.check_child_session();

  select stored_asset_id into v_asset_id from public.house_furniture_items where furniture_id = p_furniture_id;
  if v_asset_id is null then
    raise exception 'この家具はしまえません';
  end if;

  -- 行が無ければ（最初の位置のまま）作る。しまった家具は家の中に出さないので、位置は使わない（0 を入れておく）。
  -- すでにしまってあれば何も変えない（returning が行を返さない）
  insert into public.house_furniture_layouts as l (user_id, furniture_id, position_x, position_z, rotation_y, stored)
  values (auth.uid(), p_furniture_id, 0, 0, 0, true)
  on conflict (user_id, furniture_id) do update set stored = true, updated_at = now()
  where not l.stored
  returning true into v_changed;

  if v_changed then
    insert into public.owned_items(user_id, asset_id, quantity)
    values (auth.uid(), v_asset_id, 1)
    on conflict (user_id, asset_id) do update set quantity = owned_items.quantity + 1;
  end if;
end; $$;
revoke all on function public.store_house_furniture(text) from public, anon, authenticated;
grant execute on function public.store_house_furniture(text) to authenticated;

comment on column public.house_furniture_layouts.stored is 'しまったか。true の家具は家の中に出さない。store_house_furniture だけが変える';
comment on column public.house_furniture_items.stored_asset_id is 'しまったときに持ち物へ足す装飾。NULL はしまえない家具';
