-- Issue #446: 「キャラクターをえらぶ」の選べる種類に、パンダを追加する -----------------
--
-- 【なぜCHECK制約を作り直すか】
-- 選べる種類は、次の2つの制約で ('frog', 'cat', 'hamster', 'rabbit', 'dog') に絞っている
-- （直前の 20261017063856_add_dog_character_type.sql で作り直したもの）。
--   - character_appearances_type_allowed
--   - character_palettes_type_allowed
-- 値を増やすには制約自体を作り直すほかないため、両方を drop して add し直す。
-- 既存の値はすべて新しい制約を満たす（値を足すだけで、減らしていない）。
--
-- パンダの形は lib/rpg-hub/buildingParts.ts の PLAYER_PANDA_PARTS。

alter table public.character_appearances
  drop constraint character_appearances_type_allowed;

alter table public.character_appearances
  add constraint character_appearances_type_allowed
    check (character_type in ('frog', 'cat', 'hamster', 'rabbit', 'dog', 'panda'));

alter table public.character_palettes
  drop constraint character_palettes_type_allowed;

alter table public.character_palettes
  add constraint character_palettes_type_allowed
    check (character_type in ('frog', 'cat', 'hamster', 'rabbit', 'dog', 'panda'));
