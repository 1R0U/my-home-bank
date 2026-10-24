-- Issue #263: 既存の進行・申請を保持したまま、現在の期間の最初の実施として引き継ぐ。
-- 旧ウィークリーには曜日設定がないため月曜日からとする。
-- 完了済み・同名の候補があれば、元データを書き換えず適用を止める。
select private.check_quest_period_backfill();

update public.quests q
set recurrence_source_id = q.id,
    week_start_day = case when q.category = 'weekly' then 1 else null end,
    daily_end_minutes = case when q.category = 'daily' then 0 else null end,
    (period_starts_at, period_ends_at) = (
      select starts_at, ends_at from private.quest_period(q.category, case when q.category = 'weekly' then 1 else null end, clock_timestamp())
    )
where q.category in ('daily', 'weekly') and q.recurrence_source_id is null;
