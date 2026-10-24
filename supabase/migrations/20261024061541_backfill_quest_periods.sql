-- Issue #263: 既存の進行・申請を保持したまま、現在の期間の最初の実施として引き継ぐ。
-- 旧ウィークリーには曜日設定がないため月曜日からとする。
-- 2026-10-24の稼働DB確認とユーザー指定: 同名「あ」は新しい100 golの1件だけ繰り返す。
-- 古い10 golの2件は一度限りの既存タスクとして残し、受注・申請・報酬履歴を変更しない。
-- ID・区分・タイトル・報酬と、3件が同じ家庭に属することを照合する。
-- 家庭IDは画像から固定せず、確認済みの100 golの「あ」から取得する。
do $$
declare
  v_excluded_ids uuid[] := array[
    '427714d8-a0d3-4c82-af5d-92220c2611fc'::uuid,
    'de98a7ce-ae93-4be6-aea8-4edc14f79d55'::uuid
  ];
  v_confirmed_count integer;
  v_matches boolean;
  v_family_id uuid;
begin
  -- 同じトランザクション内で、確認と補完の間に旧クライアントから変更されるのを防ぐ。
  lock table public.quests in share row exclusive mode;
  select family_id into v_family_id from public.quests
    where id = 'b1731de0-5259-46aa-9734-31240983cd63';
  select count(*), bool_and(q.family_id = v_family_id
      and q.category = 'daily' and q.title = 'あ' and q.reward_amount = expected.reward_amount)
    into v_confirmed_count, v_matches
  from public.quests q join (values
    ('427714d8-a0d3-4c82-af5d-92220c2611fc'::uuid, 10),
    ('de98a7ce-ae93-4be6-aea8-4edc14f79d55'::uuid, 10),
    ('b1731de0-5259-46aa-9734-31240983cd63'::uuid, 100)
  ) expected(id, reward_amount) on q.id = expected.id;
  -- 新規環境には3件とも存在しない。既存環境では確認済み3件がそろっている必要がある。
  if v_confirmed_count <> 0 and (v_confirmed_count <> 3 or v_matches is not true) then
    raise exception '確認済みの既存クエストが変更されています。適用前確認SQLで引き継ぎ対象を再確認してください';
  end if;
  if exists (select 1 from public.quests where id = any(v_excluded_ids) and recurrence_source_id is not null) then
    raise exception '繰り返し対象外の既存クエストが既に移行されています。適用履歴を確認してください';
  end if;

  -- 確認済みの2件だけを除外し、ほかの完了済み・同名候補は引き続き停止する。
  perform private.check_quest_period_backfill(v_excluded_ids);
  update public.quests q
  set recurrence_source_id = q.id,
      week_start_day = case when q.category = 'weekly' then 1 else null end,
      daily_end_minutes = case when q.category = 'daily' then 0 else null end,
      (period_starts_at, period_ends_at) = (
        select starts_at, ends_at from private.quest_period(q.category, case when q.category = 'weekly' then 1 else null end, clock_timestamp())
      )
  where q.category in ('daily', 'weekly') and q.recurrence_source_id is null
    and not (q.id = any(v_excluded_ids));
end;
$$;
