-- Issue #235: 「キャラクターをえらぶ」の選べる種類に、うさぎを追加する -----------------
--
-- 【経緯】
-- 更衣室（Issue #235）で「どうぶつ」を着せ替え品の一種として実装していたが、
-- 同時期にmain側でも「キャラクターの種類（形）を選ぶ」仕組みが character_appearances
-- テーブル（Issue #287）として独立に作られていた。同じ目的の機能が2つ並行して
-- 作られてしまったため、character_appearances 側に一本化し、着せ替え品としての
-- 「どうぶつ」枠は廃止する。うさぎの形（lib/rpg-hub/buildingParts.ts の RABBIT_PARTS）は
-- そのまま使い、選べる種類（character_type）の1つとして追加する。
--
-- 【なぜCHECK制約を作り直すか】
-- 20260924000100_create_character_appearances.sql の
-- character_appearances_type_allowed 制約が ('frog', 'cat', 'hamster') に固定しており、
-- 増やすには制約自体を作り直す必要がある（列定義時点のCHECKはalter table dropしてaddし直す
-- ほかない）。

alter table public.character_appearances
  drop constraint character_appearances_type_allowed;

alter table public.character_appearances
  add constraint character_appearances_type_allowed
    check (character_type in ('frog', 'cat', 'hamster', 'rabbit'));
