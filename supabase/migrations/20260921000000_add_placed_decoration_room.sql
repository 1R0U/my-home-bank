-- Issue #244: 置いた装飾が「誰の家の中か」を持つようにする ---------------------
--
-- 【なぜ要るか】
-- RPGハブに家族の人数ぶんの家が建ち、家1軒につき部屋が1つある。
-- 「父の家の内装は、どの家族がどの端末から見ても父の内装」にするため、
-- 家の中に置いた装飾は**部屋の持ち主**に紐づける必要がある。
-- これまでの user_id は「置いた人」しか表せない。
--
-- 【room_owner_id の意味】
--   null      … 町・庭（外）。position_x / position_z はワールド座標
--   null以外  … その人の家の中。position_x / position_z は**部屋の中心からの相対座標**
--
-- 相対座標にしてあるのは、部屋の位置がアプリ側の定数（lib/rpg-hub/mapObjects.ts の
-- HOUSE_ROOM_CENTERS）で決まるため。部屋の並べ方を変えても、DBの行はそのまま使える。
--
-- 【既存の行】
-- すべて room_owner_id が null になる（外に置いたものとして扱う）。
-- 家の中はまだリリースしていないため、詰め替えは行わない。

alter table public.placed_decorations
  add column if not exists room_owner_id uuid references public.users (id) on delete cascade;

comment on column public.placed_decorations.room_owner_id is
  '家の中に置いた場合の、その家の持ち主（users.id）。nullなら町・庭。nullでない場合、position_x/zは部屋の中心からの相対座標';

-- 家に入るたびに「その家の持ち主が置いたもの」を引くため、room_owner_id で引ける状態にする。
-- 外に置いたもの（null）は user_id 側の索引で引くので、部分索引にする。
create index if not exists placed_decorations_room_owner_id_idx
  on public.placed_decorations (room_owner_id)
  where room_owner_id is not null;
