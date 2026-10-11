-- 家族の操作をきっかけにお知らせが作られるかを確認する（#357 #358 #360 #361 #365 #366）。
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

-- 日本時間で今日から p_days_ago 日前の、p_time の時刻
create function pg_temp.jst(p_days_ago integer, p_time time default '12:00')
returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Tokyo')::date - p_days_ago) + p_time) at time zone 'Asia/Tokyo';
$$;

create function pg_temp.has_title(p_user_id uuid, p_title text)
returns boolean language sql as $$
  select exists (select 1 from public.notifications where user_id = p_user_id and title = p_title);
$$;

create function pg_temp.count_for(p_user_id uuid, p_key_prefix text)
returns integer language sql as $$
  select count(*)::integer from public.notifications
  where user_id = p_user_id and dedupe_key like p_key_prefix || '%';
$$;

-- 家庭A: 親2人（片方は通知オフ）・子供2人 / 家庭B: 親1人・子供1人
insert into public.families (id, name) values
  ('35700000-0000-4000-8000-000000000001', '357家庭A'),
  ('35700000-0000-4000-8000-000000000002', '357家庭B');

insert into public.users (id, family_id, name, role, balance, notifications_enabled) values
  ('35700000-0000-4000-8000-000000000011', '35700000-0000-4000-8000-000000000001', 'おとうさん', 'parent', 0, true),
  ('35700000-0000-4000-8000-000000000012', '35700000-0000-4000-8000-000000000001', 'おかあさん', 'parent', 0, false),
  ('35700000-0000-4000-8000-000000000013', '35700000-0000-4000-8000-000000000001', 'たろう', 'child', 0, true),
  ('35700000-0000-4000-8000-000000000014', '35700000-0000-4000-8000-000000000001', 'はなこ', 'child', 0, true),
  ('35700000-0000-4000-8000-000000000021', '35700000-0000-4000-8000-000000000002', 'B家の親', 'parent', 0, true),
  ('35700000-0000-4000-8000-000000000022', '35700000-0000-4000-8000-000000000002', 'B家の子', 'child', 0, true);

-- #357 承認待ち ------------------------------------------------------------------------
insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('35700000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000001', 'おふろそうじ', '', 10, 'accepted',
   '35700000-0000-4000-8000-000000000011', 'daily', '35700000-0000-4000-8000-000000000013');

-- 子供本人として、アプリと同じRPCで終わったことを申請する
set role authenticated;
select set_config('request.jwt.claim.sub', '35700000-0000-4000-8000-000000000013', false);
select public.submit_quest_completion('35700000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000013');
reset role;

select pg_temp.assert(
  (select count(*) from public.notifications
   where user_id = '35700000-0000-4000-8000-000000000011'
     and title = 'たろうさんが「おふろそうじ」を終えました' and route = 'tasks' and read_at is null) = 1,
  '#357 タスクを終えると、同じ家庭の親へ承認待ちのお知らせが届く'
);
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000012', 'quest_log_pending:') = 0,
  '#357 通知をオフにしている親には届かない'
);
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000021', 'quest_log_pending:') = 0
    and pg_temp.count_for('35700000-0000-4000-8000-000000000013', 'quest_log_pending:') = 0,
  '#357 別の家庭の親や、子供本人には届かない'
);

-- #358 家事の申請 ----------------------------------------------------------------------
insert into public.task_reports (id, reported_by, title, description, family_id) values
  ('35800000-0000-4000-8000-000000000001', '35700000-0000-4000-8000-000000000014', 'くつをそろえた', '', '35700000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select count(*) from public.notifications
   where user_id = '35700000-0000-4000-8000-000000000011'
     and title = 'はなこさんから家事の申請が届きました'
     and body like '「くつをそろえた」%' and route = 'tasks') = 1,
  '#358 家事を申請すると、親へお知らせが届く'
);

-- #360 商品追加の申請 ------------------------------------------------------------------
insert into public.store_item_requests (id, requested_by, title, description, reason, image_url, family_id) values
  ('36000000-0000-4000-8000-000000000001', '35700000-0000-4000-8000-000000000014', 'ゲーム30分', '', 'ほしい', '', '35700000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select count(*) from public.notifications
   where user_id = '35700000-0000-4000-8000-000000000011'
     and title = 'はなこさんから商品追加の申請が届きました' and route = 'store') = 1,
  '#360 商品追加を申請すると、親へお知らせが届く'
);

-- 承認待ちではない状態で入った行（過去の記録の取り込みなど）では作らない
insert into public.task_reports (reported_by, title, description, family_id, status) values
  ('35700000-0000-4000-8000-000000000014', '取り込み', '', '35700000-0000-4000-8000-000000000001', 'approved');
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000011', 'task_report_pending:') = 1,
  '#358 承認待ちでない申請では作らない'
);

-- #365 ストアの更新 --------------------------------------------------------------------
insert into public.store_items (id, family_id, requested_by, title, description, price, stock, is_active) values
  ('36500000-0000-4000-8000-000000000001', '35700000-0000-4000-8000-000000000001', '35700000-0000-4000-8000-000000000011', 'おやつ', '', 100, 5, true),
  ('36500000-0000-4000-8000-000000000002', '35700000-0000-4000-8000-000000000001', '35700000-0000-4000-8000-000000000011', 'じゅんびちゅう', '', 100, 5, false);

select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000013', 'store_item_new:') = 1
    and pg_temp.count_for('35700000-0000-4000-8000-000000000014', 'store_item_new:') = 1,
  '#365 販売中の商品が並ぶと、同じ家庭の子供全員に届く（販売停止で追加したものは届かない）'
);
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000011', 'store_item_new:') = 0
    and pg_temp.count_for('35700000-0000-4000-8000-000000000022', 'store_item_new:') = 0,
  '#365 親や別の家庭の子供には届かない'
);

update public.store_items set price = 80 where id = '36500000-0000-4000-8000-000000000001';
update public.store_items set price = 120 where id = '36500000-0000-4000-8000-000000000001';
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000013', 'store_item_price_down:') = 1,
  '#365 値下がりで届き、値上がりでは届かない'
);
select pg_temp.assert(
  exists (select 1 from public.notifications
          where user_id = '35700000-0000-4000-8000-000000000013'
            and dedupe_key = 'store_item_price_down:36500000-0000-4000-8000-000000000001:80:'
              || ((now() at time zone 'Asia/Tokyo')::date)::text),
  '#365 値下がりのキーには日付が入る（値上げのあと別の日に同じ値段へ下げると、また届く）'
);

update public.store_items set stock = 0 where id = '36500000-0000-4000-8000-000000000001';
update public.store_items set stock = 3 where id = '36500000-0000-4000-8000-000000000001';
update public.store_items set is_active = true where id = '36500000-0000-4000-8000-000000000002';
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000013', 'store_item_restock:') = 2,
  '#365 売り切れからの補充と、販売の再開で「また買える」が届く'
);

update public.store_items set stock = 0 where id = '36500000-0000-4000-8000-000000000001';
update public.store_items set stock = 3 where id = '36500000-0000-4000-8000-000000000001';
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000013', 'store_item_restock:') = 2,
  '#365 同じ商品の再入荷は1日1回まで'
);

-- #361 / #366 連続記録 -----------------------------------------------------------------
-- はなこ: 2日前・昨日は承認済み。今日の分が承認されると3日連続になる
insert into public.quests
  (id, family_id, title, description, reward_amount, status, created_by, category, assigned_to) values
  ('36600000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000001', 'れんぞく用', '', 10, 'open',
   '35700000-0000-4000-8000-000000000011', 'daily', null);
insert into public.quest_logs (id, quest_id, user_id, status, completed_at) values
  ('36600000-0000-4000-8000-000000000201', '36600000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000014', 'approved', pg_temp.jst(2)),
  ('36600000-0000-4000-8000-000000000202', '36600000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000014', 'approved', pg_temp.jst(1)),
  ('36600000-0000-4000-8000-000000000203', '36600000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000014', 'pending', pg_temp.jst(0, '09:00')),
  ('36600000-0000-4000-8000-000000000204', '36600000-0000-4000-8000-000000000101', '35700000-0000-4000-8000-000000000014', 'pending', pg_temp.jst(0, '10:00'));

select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000014', 'quest_streak:') = 0,
  '#366 承認済みとして入った行では、まだ連続記録のお知らせは作らない'
);

update public.quest_logs set status = 'approved' where id = '36600000-0000-4000-8000-000000000203';

select pg_temp.assert(
  (select count(*) from public.notifications
   where user_id = '35700000-0000-4000-8000-000000000014'
     and title = 'れんぞく3にち たっせい！' and route = 'tasks') = 1,
  '#366 承認されて3日連続になると、子供本人に届く'
);
select pg_temp.assert(
  (select count(*) from public.notifications
   where user_id = '35700000-0000-4000-8000-000000000011'
     and title = 'はなこさんが3日連続でお手伝いしました') = 1,
  '#361 同じとき、親にも届く'
);

update public.quest_logs set status = 'approved' where id = '36600000-0000-4000-8000-000000000204';
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000014', 'quest_streak:') = 1
    and pg_temp.count_for('35700000-0000-4000-8000-000000000011', 'quest_streak:') = 1,
  '#361 #366 同じ日に2件目が承認されても、同じ日数のお知らせは1回だけ'
);

-- たろうは今日の1件だけ。承認されても1日連続
update public.quest_logs set status = 'approved' where user_id = '35700000-0000-4000-8000-000000000013';
select pg_temp.assert(
  pg_temp.count_for('35700000-0000-4000-8000-000000000013', 'quest_streak:') = 0,
  '#366 1日だけでは知らせない'
);

-- #361 / #366 その承認で新しく届いた日数だけを知らせる（PR #404 のレビュー） ---------------------
insert into public.users (id, family_id, name, role, balance) values
  ('36600000-0000-4000-8000-000000000031', '35700000-0000-4000-8000-000000000001', 'つなぐ', 'child', 0),
  ('36600000-0000-4000-8000-000000000032', '35700000-0000-4000-8000-000000000001', 'まえから', 'child', 0);

-- つなぐ: 5・4日前は承認済み、3日前は承認待ち、2・1日前は承認済み、今日は承認待ち
insert into public.quest_logs (id, quest_id, user_id, status, completed_at) values
  ('36600000-0000-4000-8000-000000000301', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000031', 'approved', pg_temp.jst(5)),
  ('36600000-0000-4000-8000-000000000302', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000031', 'approved', pg_temp.jst(4)),
  ('36600000-0000-4000-8000-000000000303', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000031', 'pending', pg_temp.jst(3)),
  ('36600000-0000-4000-8000-000000000304', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000031', 'approved', pg_temp.jst(2)),
  ('36600000-0000-4000-8000-000000000305', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000031', 'approved', pg_temp.jst(1)),
  ('36600000-0000-4000-8000-000000000306', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000031', 'pending', pg_temp.jst(0));

update public.quest_logs set status = 'approved' where id = '36600000-0000-4000-8000-000000000306';
select pg_temp.assert(
  pg_temp.has_title('36600000-0000-4000-8000-000000000031', 'れんぞく3にち たっせい！')
    and pg_temp.count_for('36600000-0000-4000-8000-000000000031', 'quest_streak:') = 1,
  '#366 今日の承認で3日連続になると届く'
);
update public.quest_logs set status = 'approved' where id = '36600000-0000-4000-8000-000000000303';
select pg_temp.assert(
  pg_temp.count_for('36600000-0000-4000-8000-000000000031', 'quest_streak:') = 1
    and pg_temp.count_for('35700000-0000-4000-8000-000000000011', 'quest_streak:36600000-0000-4000-8000-000000000031') = 1,
  '#361 #366 途切れていた日が後から承認されて6日連続につながっても、3日をもう一度知らせない'
);

-- まえから: このお知らせを入れる前から5日続けている（5〜1日前は承認済み）。今日は承認待ちが2件
insert into public.quest_logs (id, quest_id, user_id, status, completed_at) values
  ('36600000-0000-4000-8000-000000000401', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'approved', pg_temp.jst(5)),
  ('36600000-0000-4000-8000-000000000402', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'approved', pg_temp.jst(4)),
  ('36600000-0000-4000-8000-000000000403', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'approved', pg_temp.jst(3)),
  ('36600000-0000-4000-8000-000000000404', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'approved', pg_temp.jst(2)),
  ('36600000-0000-4000-8000-000000000405', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'approved', pg_temp.jst(1)),
  ('36600000-0000-4000-8000-000000000406', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'pending', pg_temp.jst(0, '09:00')),
  ('36600000-0000-4000-8000-000000000407', '36600000-0000-4000-8000-000000000101', '36600000-0000-4000-8000-000000000032', 'pending', pg_temp.jst(0, '10:00'));

update public.quest_logs set status = 'approved' where id = '36600000-0000-4000-8000-000000000406';
update public.quest_logs set status = 'approved' where id = '36600000-0000-4000-8000-000000000407';
select pg_temp.assert(
  pg_temp.count_for('36600000-0000-4000-8000-000000000032', 'quest_streak:') = 0
    and pg_temp.count_for('35700000-0000-4000-8000-000000000011', 'quest_streak:36600000-0000-4000-8000-000000000032') = 0,
  '#361 #366 入れる前から続いていた子供には、通り過ぎた3日を今さら知らせない（5日→6日、同じ日の2件目も）'
);

-- 連続日数の数え方は1か所（PR #404 のレビュー） ----------------------------------------------
select pg_temp.assert(
  (select prosrc from pg_proc where oid = 'private.quest_streak_for(uuid, date)'::regprocedure)
    like '%private.quest_streak_counting(%array[''approved'']%',
  '#372 の quest_streak_for は quest_streak_counting で承認済みだけを数える形になっている'
);
select pg_temp.assert(
  (select count(*) from private.quest_streak_for('36600000-0000-4000-8000-000000000031', (now() at time zone 'Asia/Tokyo')::date)
   where current_days = 6) = 1,
  'quest_streak_for で数えた日数と、お知らせで数えた日数が一致する（つなぐ: 6日）'
);

-- 元の操作を止めない -----------------------------------------------------------------------
-- お知らせの入れ物に作れない状態でも、元の操作は成功する
alter table public.notifications add constraint pg_temp_block check (dedupe_key is null) not valid;
insert into public.task_reports (reported_by, title, description, family_id) values
  ('35700000-0000-4000-8000-000000000014', 'ブロック中', '', '35700000-0000-4000-8000-000000000001');
select pg_temp.assert(
  exists (select 1 from public.task_reports where title = 'ブロック中'),
  'お知らせを作れなくても、元の申請は保存される'
);
alter table public.notifications drop constraint pg_temp_block;

-- アプリからは関数を呼べない
select pg_temp.assert(
  not has_function_privilege('authenticated', 'private.notify(uuid, text, text, text, text)'::regprocedure, 'execute')
    and not has_function_privilege('anon', 'private.notify(uuid, text, text, text, text)'::regprocedure, 'execute'),
  'アプリ（anon / authenticated）はお知らせを作る関数を呼べない'
);
