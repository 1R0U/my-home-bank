-- このマイグレーションで行う変更を記述してください。
-- Issue #263: 既存の進行・申請を保持したまま、現在の期間の最初の実施として引き継ぐ。
-- 旧ウィークリーには曜日設定がないため月曜日からとする。
update public.quests q
set recurrence_source_id = q.id,
    week_start_day = case when q.category = 'weekly' then 1 else null end,
    daily_end_minutes = case when q.category = 'daily' then 0 else null end,
    period_starts_at = p.starts_at,
    period_ends_at = p.ends_at
from public.quests source
cross join lateral private.quest_period(source.category, case when source.category = 'weekly' then 1 else null end, clock_timestamp()) p
where q.id = source.id and q.category in ('daily', 'weekly') and q.recurrence_source_id is null;
