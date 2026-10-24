-- Issue #263: 既存の進行・申請を保持したまま、現在の期間の最初の実施として引き継ぐ。
-- 旧ウィークリーには曜日設定がないため月曜日からとする。
-- 2026-10-24の稼働DB確認とユーザー指定: 同名「あ」は新しい100 golの1件だけ繰り返す。
-- 古い10 golの2件は一度限りの既存タスクとして残し、受注・申請・報酬履歴を変更しない。
-- 2026-10-25の追加確認: 完了済みのお風呂掃除・宿題・部屋の掃除は次の終了時刻から繰り返す。
-- 完了済みの「あ・い・う」は履歴だけ残す。完了状態・申請・支払い済みの報酬は変更しない。
-- ID・区分・タイトル・報酬と、3件が同じ家庭に属することを照合する。
-- 家庭IDは画像から固定せず、確認済みの100 golの「あ」から取得する。
do $$
declare
  v_excluded_ids uuid[] := array[
    '427714d8-a0d3-4c82-af5d-92220c2611fc'::uuid,
    'de98a7ce-ae93-4be6-aea8-4edc14f79d55'::uuid,
    'a59f40bf-90e2-4afc-89a2-068d756fc998'::uuid,
    'ea9a1523-bd3c-4dfd-bfef-81bb5e095cc9'::uuid,
    '012a4c92-1bf0-4672-82c1-c45ef5d6acb3'::uuid
  ];
  v_completed_source_ids uuid[] := array[
    'f8f409e5-4794-4b5a-a941-bb2500123aef'::uuid,
    '31a440bb-a066-4c39-9b1e-245f97f45d25'::uuid,
    '56d11b9d-9e3a-4de8-ac40-0f3a702dabe9'::uuid
  ];
  v_confirmed_count integer;
  v_matches boolean;
  v_family_id uuid;
  v_now timestamptz;
begin
  -- 同じトランザクション内で、確認と補完の間に旧クライアントから変更されるのを防ぐ。
  lock table public.quests in share row exclusive mode;
  v_now := clock_timestamp();
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

  -- 完了済み6件もID・内容・状態・同じ家庭への所属を照合し、今回の指定だけを反映する。
  select family_id into v_family_id from public.quests
    where id = 'f8f409e5-4794-4b5a-a941-bb2500123aef';
  select count(*), bool_and(q.family_id = v_family_id and q.category = 'daily'
      and q.status = 'completed' and q.title = expected.title and q.reward_amount = expected.reward_amount)
    into v_confirmed_count, v_matches
  from public.quests q join (values
    ('a59f40bf-90e2-4afc-89a2-068d756fc998'::uuid, 'あ', 10),
    ('ea9a1523-bd3c-4dfd-bfef-81bb5e095cc9'::uuid, 'い', 10),
    ('012a4c92-1bf0-4672-82c1-c45ef5d6acb3'::uuid, 'う', 10),
    ('f8f409e5-4794-4b5a-a941-bb2500123aef'::uuid, 'お風呂掃除', 100),
    ('31a440bb-a066-4c39-9b1e-245f97f45d25'::uuid, '宿題', 50),
    ('56d11b9d-9e3a-4de8-ac40-0f3a702dabe9'::uuid, '部屋の掃除', 100)
  ) expected(id, title, reward_amount) on q.id = expected.id;
  if v_confirmed_count <> 0 and (v_confirmed_count <> 6 or v_matches is not true) then
    raise exception '確認済みの完了済みクエストが変更されています。適用前確認SQLで引き継ぎ対象を再確認してください';
  end if;
  if exists (select 1 from public.quests where id = any(v_excluded_ids) and recurrence_source_id is not null) then
    raise exception '繰り返し対象外の既存クエストが既に移行されています。適用履歴を確認してください';
  end if;

  -- 完了済みを設定元にする前に、既に期間が付いた同名の設定元との重複も検査する。
  if exists (select 1 from public.quests q join public.quests source
    on source.id = any(v_completed_source_ids) and q.id <> source.id
      and q.family_id = source.family_id and q.category = source.category and btrim(q.title) = btrim(source.title)
    where (q.recurrence_source_id is null or q.recurrence_source_id = q.id)
      and not (q.id = any(v_excluded_ids))) then
    raise exception '既存クエストの引き継ぎ対象が未確認です（同名の行が複数）。適用前確認SQLの結果を確認してください';
  end if;

  -- 指定された完了済み3件は現在の回も完了済みのまま設定元にし、次の終了時刻まで再開しない。
  -- この後の検査で未知の完了済み・同名候補が見つかれば、この補完も同じDO内で取り消される。
  update public.quests q
  set recurrence_source_id = q.id, daily_end_minutes = 0,
      (period_starts_at, period_ends_at) = (
        select starts_at, ends_at from private.quest_period(q.category, null, v_now)
      )
  where q.id = any(v_completed_source_ids) and q.recurrence_source_id is null;

  -- 確認済みの履歴5件だけを除外し、ほかの完了済み・同名候補は引き続き停止する。
  perform private.check_quest_period_backfill(v_excluded_ids);
  update public.quests q
  set recurrence_source_id = q.id,
      week_start_day = case when q.category = 'weekly' then 1 else null end,
      daily_end_minutes = case when q.category = 'daily' then 0 else null end,
      (period_starts_at, period_ends_at) = (
        select starts_at, ends_at from private.quest_period(q.category, case when q.category = 'weekly' then 1 else null end, v_now)
      )
  where q.category in ('daily', 'weekly') and q.recurrence_source_id is null
    and not (q.id = any(v_excluded_ids));
end;
$$;
