-- Issue #222: 所有アイテムと装備を保存する --------------------------------------
--
-- 【何を保存するか】
-- 持っているアイテムのIDと、いまどの枠に何を着けているかだけを持つ。
-- **見た目（形・色・付く位置）はアプリ側のカタログ**（lib/rpg-hub/catalog.ts）が持ち、
-- DBには入れない。見た目を直すのにマイグレーションが要る状態にしたくないため
-- （placed_decorations と同じ考え方）。
--
-- 【持っていないものを装備できないこと】
-- アプリ側のチェックだけに頼らず、DBでも担保する。
-- equipped_items から owned_items への複合外部キー (user_id, asset_id) がそれで、
-- 持っていない行を指す装備は insert できない。
-- 所有を取り消したら装備も一緒に外れる（on delete cascade）。
--
-- 【1つの枠には1つだけ】
-- equipped_items の主キーを (user_id, slot) にしてある。重ね着は考えていない。
--
-- 【家庭ごとの分離について】
-- family の概念がまだ無いため（Issue #208）、持ち主（users.id）に紐づける。
-- 1 Supabase プロジェクト＝1家庭の前提のまま。

create table if not exists public.owned_items (
  user_id uuid not null references public.users (id) on delete cascade,
  -- カタログのアセットID（例: wearable-hat）。アプリ側で許可リストと突き合わせる。
  -- ここでCHECK制約にすると、アイテムを増やすたびにマイグレーションが要るため付けない。
  asset_id text not null,
  acquired_at timestamptz not null default now(),

  -- 同じものを2つ持っても意味がないので、1人1種類1行にする。
  -- equipped_items からの外部キーの参照先にもなる。
  primary key (user_id, asset_id),
  constraint owned_items_asset_id_not_empty check (length(btrim(asset_id)) > 0)
);

create table if not exists public.equipped_items (
  user_id uuid not null,
  -- 着せ替え品を付ける場所。アプリ側の EquipmentSlot（types/map.ts）と対応する。
  -- **枠を増やすときはここも新しいマイグレーションで広げること。**
  -- アセットIDと違って枠は滅多に増えず、知らない枠が入ると付け先が無いため制約にする。
  slot text not null,
  asset_id text not null,
  updated_at timestamptz not null default now(),

  -- 1つの枠に着けられるのは1つだけ
  primary key (user_id, slot),
  constraint equipped_items_slot_allowed check (slot in ('back', 'face', 'head')),
  -- **持っていないものを装備できないことの担保。**
  -- users への直接の参照を持たせていないのは、owned_items が既に users を
  -- 参照していて、利用者を消せばここまで連鎖して消えるため。
  constraint equipped_items_owned_fkey
    foreign key (user_id, asset_id) references public.owned_items (user_id, asset_id)
    on delete cascade
);
