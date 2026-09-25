-- Issue #235: 装着スロットに「どうぶつ（body）」を追加する --------------------------
--
-- 【何のための枠か】
-- カエル・うさぎなど、プレイヤーの見た目そのもの（土台）を選べるようにする枠。
-- 帽子・めがねのように「土台に載る」側ではなく「土台そのものを差し替える」側という
-- 点で他の枠と性質が違うが、DBの持ち方（所有・装備）はまったく同じにできる
-- （見た目・付く位置はアプリ側のカタログが持ち、DBには入れない方針も変わらない）。
--
-- 20260917000000_create_wardrobe.sql の注記どおり、枠を増やすのでここを
-- 新しいマイグレーションで広げる。

alter table public.equipped_items drop constraint equipped_items_slot_allowed;
alter table public.equipped_items
  add constraint equipped_items_slot_allowed check (slot in ('back', 'body', 'face', 'head'));
