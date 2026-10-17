-- Issue #446: 「キャラクターをえらぶ」の選べる種類に、いぬとパンダを追加する ------------
--
-- 【なぜCHECK制約を作り直すか】
-- 選べる種類は、次の2つの制約で ('frog', 'cat', 'hamster', 'rabbit') に絞っている。
--   - character_appearances_type_allowed（20260929000000_add_rabbit_character_type.sql）
--   - character_palettes_type_allowed（20261008094946_create_character_palettes.sql）
-- 値を増やすには制約自体を作り直すほかないため、両方を drop して add し直す。
-- 既存の値はすべて新しい制約を満たす（値を足すだけで、減らしていない）。
--
-- いぬ・パンダは、作り直しを1回で済ませるよう1本にまとめて許可する
-- （PR #456 レビュー対応。作り直すたびに両テーブルへ ACCESS EXCLUSIVE ロックがかかるため）。
--
-- いぬの形は lib/rpg-hub/buildingParts.ts の PLAYER_DOG_PARTS、パンダは PLAYER_PANDA_PARTS。
-- 適用済みかは tests/sql/verify_remote_schema.sql の「制約の版」で確認できる。

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
