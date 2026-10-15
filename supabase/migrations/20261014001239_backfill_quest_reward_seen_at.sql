-- Issue #424: 既にある承認済みの申請を「見せた」扱いにする --------------------------------
--
-- 承認のお知らせ（get_unseen_quest_rewards）は reward_seen_at が null の承認を出す。
-- 仕組みを入れる前の承認まで出すと、過去の分がまとめて出てしまうため、承認された時刻で埋める。
-- 承認された時刻が無い行（古いデータ）は、このマイグレーションを適用した時刻で埋める。
-- 何度適用しても、埋まっていない行だけを埋めるので結果は変わらない。

update public.quest_logs
set reward_seen_at = coalesce(approved_at, now())
where status = 'approved'
  and reward_seen_at is null;
