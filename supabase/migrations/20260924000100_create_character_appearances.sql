-- Issue #287: プレイヤーキャラクターの見た目の種類（形）を保存する -------------------
--
-- 【何を保存するか】
-- 選んでいるキャラクターの種類（species）だけを持つ。色（palette、#253）とは別の
-- 列・別の仕組みにする。形そのものの定義（パーツ・アンカー）はアプリ側のカタログ
-- （lib/rpg-hub/catalog.ts）が持ち、DBには種類を表す文字列だけを入れる
-- （placed_decorations / owned_items と同じ考え方）。
--
-- 【許可する値をCHECK制約にする理由】
-- アセットID（着せ替え品・装飾など、自由に増える想定）と違い、キャラクター種類は
-- 数が少なく、増やすときはカタログ側にも形を追加する作業が必ず要る。
-- equipped_items.slot と同じ理由で、ここでも許可値を縛る。未知の値が入ると
-- 対応する形が無く、見た目を組み立てられない。
--
-- 【1人1行・既定値について】
-- user_id を主キーにする。まだ選んだことが無い人も既定（frog）で表示できるよう、
-- 列に default を持たせる（行が無い場合のアプリ側フォールバックと二重で守る）。
--
-- 【家庭ごとの分離について】
-- 色（palette）や着せ替え（owned_items）と同じく、家庭で共有する情報ではないため
-- family_id は持たせず、本人（users.id）にだけ紐づける。

create table if not exists public.character_appearances (
  user_id uuid primary key references public.users (id) on delete cascade,
  character_type text not null default 'frog',
  updated_at timestamptz not null default now(),

  constraint character_appearances_type_allowed
    check (character_type in ('frog', 'cat', 'hamster'))
);

alter table public.character_appearances enable row level security;

create policy character_appearances_select_self on public.character_appearances
for select to authenticated using (user_id = auth.uid());
create policy character_appearances_insert_self on public.character_appearances
for insert to authenticated with check (user_id = auth.uid());
create policy character_appearances_update_self on public.character_appearances
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table public.character_appearances from anon, authenticated;
-- placed_decorations / owned_items / equipped_items と同じ、自分専用データの形。
-- 列を絞る必要がある共有テーブル（quests等）と違い、列制限はせず素直に許可する
grant select, insert, update on table public.character_appearances to authenticated;
