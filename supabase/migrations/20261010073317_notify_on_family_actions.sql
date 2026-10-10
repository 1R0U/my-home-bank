-- 家族の操作をきっかけに、お知らせを作る ------------------------------------------------
--
-- Issue #354 で作ったお知らせの入れ物（notifications）に、行を作る処理を足す。
-- このマイグレーションは「だれかの操作」をきっかけに作るものを扱う。
-- 時刻をきっかけに作るもの（誕生日・返済日・デイリーの残りなど）は別のマイグレーションで足す。
--
-- | Issue | だれあて | きっかけ                                   | 行き先 |
-- | ----- | -------- | ------------------------------------------ | ------ |
-- | #357  | 親       | 子供がタスクを終えて承認待ちになった       | tasks  |
-- | #358  | 親       | 子供が自分でやった家事を申請した           | tasks  |
-- | #360  | 親       | 子供が商品追加を申請した                   | store  |
-- | #361  | 親       | 子供の連続記録がキリのいい日数に届いた     | tasks  |
-- | #366  | 子供     | 自分の連続記録がキリのいい日数に届いた     | tasks  |
-- | #365  | 子供     | ストアに商品が並んだ・値下がり・再入荷した | store  |
--
-- 【届け先】
-- 掲示板とベル（お知らせ）だけ。端末へのアプリ通知（プッシュ通知）はまだ無い。
--
-- 【通知の設定（users.notifications_enabled）】
-- 設定画面で「通知」をオフにしている人には作らない。
--
-- 【同じお知らせを2回作らない（dedupe_key）】
-- 「何についての、どのお知らせか」を表すキーを持たせ、同じ人に同じキーでは1件しか作らない。
-- 時刻をきっかけにするお知らせ（定期実行で何度呼ばれても1回だけ届けたい）でも使う。
--
-- 【元の操作を止めない】
-- お知らせはおまけなので、作るのに失敗しても元の操作（承認・申請・商品の追加など）は
-- 成功させる。各トリガーは例外を受け止めて警告だけ出す。

-- 1. 同じお知らせを2回作らないためのキー -------------------------------------------------

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists notifications_user_dedupe_key_unique
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- 2. お知らせを1件作る --------------------------------------------------------------------
--
-- 通知をオフにしている人・見つからない人には作らない。同じキーのお知らせが既にあれば
-- 何もしない。作ったら true を返す。
create or replace function private.notify(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_route text,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if not exists (
    select 1 from public.users
    where users.id = p_user_id and users.notifications_enabled
  ) then
    return false;
  end if;

  insert into public.notifications (user_id, title, body, route, dedupe_key)
  values (p_user_id, p_title, coalesce(p_body, ''), p_route, p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- 3. 家族の親全員・子供全員へ作る ----------------------------------------------------------
create or replace function private.notify_family_role(
  p_family_id uuid,
  p_role text,
  p_title text,
  p_body text,
  p_route text,
  p_dedupe_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count integer := 0;
begin
  if p_family_id is null then
    return 0;
  end if;

  for v_user_id in
    select users.id from public.users
    where users.family_id = p_family_id and users.role = p_role
  loop
    if private.notify(v_user_id, p_title, p_body, p_route, p_dedupe_key) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- 名前が空のときの呼び方
create or replace function private.notification_user_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(users.name), ''), '子供')
  from public.users
  where users.id = p_user_id;
$$;

-- 4. #357 タスクを終えて承認待ちになった（親あて） --------------------------------------------
--
-- 1件ずつ知らせる。まとめて知らせる形は、件数が多くて困ることが分かってから考える。
create or replace function private.notify_quest_log_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  begin
    select quests.title into v_title from public.quests where quests.id = new.quest_id;

    perform private.notify_family_role(
      new.family_id,
      'parent',
      private.notification_user_name(new.user_id) || 'さんが「' || coalesce(v_title, 'タスク') || '」を終えました',
      '承認すると報酬が支払われます。タスク画面の承認タブから確認できます。',
      'tasks',
      'quest_log_pending:' || new.id::text
    );
  exception when others then
    raise warning 'お知らせを作れませんでした（承認待ち %）: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_quest_log_pending_after_insert on public.quest_logs;
create trigger notify_quest_log_pending_after_insert
after insert on public.quest_logs
for each row execute function private.notify_quest_log_pending();

-- 5. #358 自分でやった家事を申請した（親あて） ------------------------------------------------
create or replace function private.notify_task_report_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  begin
    perform private.notify_family_role(
      new.family_id,
      'parent',
      private.notification_user_name(new.reported_by) || 'さんから家事の申請が届きました',
      '「' || coalesce(new.title, '家事') || '」。タスク画面から確認できます。',
      'tasks',
      'task_report_pending:' || new.id::text
    );
  exception when others then
    raise warning 'お知らせを作れませんでした（家事の申請 %）: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_task_report_pending_after_insert on public.task_reports;
create trigger notify_task_report_pending_after_insert
after insert on public.task_reports
for each row execute function private.notify_task_report_pending();

-- 6. #360 商品追加を申請した（親あて） --------------------------------------------------------
--
-- 今のストアには「購入に親の許可が要る」仕組みが無い。親の判断を待つのは商品追加の申請なので、
-- これを「許可が要る申請」として知らせる。
create or replace function private.notify_store_item_request_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  begin
    perform private.notify_family_role(
      new.family_id,
      'parent',
      private.notification_user_name(new.requested_by) || 'さんから商品追加の申請が届きました',
      '「' || coalesce(new.title, '商品') || '」。ストア画面の申請タブから確認できます。',
      'store',
      'store_item_request_pending:' || new.id::text
    );
  exception when others then
    raise warning 'お知らせを作れませんでした（商品追加の申請 %）: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_store_item_request_pending_after_insert on public.store_item_requests;
create trigger notify_store_item_request_pending_after_insert
after insert on public.store_item_requests
for each row execute function private.notify_store_item_request_pending();

-- 7. #361 / #366 連続記録がキリのいい日数に届いた（子供本人と親あて） ---------------------------
--
-- 連続記録は承認されたタスクで数える（private.quest_streak_for）。そのため、承認されたときに
-- 数え直し、今の連続日数までに届いたキリのいい日数のうち一番大きいものを知らせる。
-- 承認が数日まとめて来て、3日 → 7日 を飛び越えたときも、7日の分を1回だけ知らせる。
--
-- キーは「その連続記録が始まった日」と日数で作る。記録が途切れて新しく始まれば、また知らせる。
create or replace function private.notify_quest_streak_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_role text;
  v_family_id uuid;
  v_days integer;
  v_started_on date;
  v_milestone integer;
  v_key text;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  begin
    select users.role, users.family_id into v_role, v_family_id
    from public.users where users.id = new.user_id;

    if v_role is distinct from 'child' then
      return new;
    end if;

    select streak.current_days, streak.started_on into v_days, v_started_on
    from private.quest_streak_for(new.user_id, v_today) as streak;

    if coalesce(v_days, 0) <= 0 or v_started_on is null then
      return new;
    end if;

    select max(candidate.days)::integer into v_milestone
    from generate_series(1, v_days) as candidate(days)
    where private.is_quest_streak_milestone(candidate.days);

    if v_milestone is null then
      return new;
    end if;

    v_key := 'quest_streak:' || new.user_id::text || ':' || v_started_on::text || ':' || v_milestone::text;

    perform private.notify(
      new.user_id,
      'れんぞく' || v_milestone || 'にち たっせい！',
      'まいにち つづけて えらいね。この ちょうしで つづけよう！',
      'tasks',
      v_key
    );

    perform private.notify_family_role(
      v_family_id,
      'parent',
      private.notification_user_name(new.user_id) || 'さんが' || v_milestone || '日連続でお手伝いしました',
      'キリのいい日数に届きました。声をかけてあげましょう。',
      'tasks',
      v_key
    );
  exception when others then
    raise warning 'お知らせを作れませんでした（連続記録 %）: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_quest_streak_milestone_after_update on public.quest_logs;
create trigger notify_quest_streak_milestone_after_update
after update of status on public.quest_logs
for each row execute function private.notify_quest_streak_milestone();

-- 8. #365 ストアの更新（子供あて） ------------------------------------------------------------
--
-- 「更新」として知らせるのは次の3つ。
--   - 新しい商品が並んだ（並べた時点で販売中のもの）
--   - 元の値段（store_items.price）が下がった
--   - 売り切れ・販売停止から、また買えるようになった（再入荷）
--
-- 物価指数による表示価格の変化（月ごと）は知らせない。全商品が一度に動き、
-- 1つずつ知らせると多すぎるため。
create or replace function private.notify_store_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today text := ((now() at time zone 'Asia/Tokyo')::date)::text;
begin
  begin
    if tg_op = 'INSERT' then
      if new.is_active and new.stock > 0 then
        perform private.notify_family_role(
          new.family_id,
          'child',
          'ストアに「' || new.title || '」が はいったよ',
          'ストアで みてみよう。',
          'store',
          'store_item_new:' || new.id::text
        );
      end if;
      return new;
    end if;

    if not new.is_active or new.stock <= 0 then
      return new;
    end if;

    if not old.is_active or old.stock <= 0 then
      perform private.notify_family_role(
        new.family_id,
        'child',
        '「' || new.title || '」が また かえるように なったよ',
        'ストアで みてみよう。',
        'store',
        'store_item_restock:' || new.id::text || ':' || v_today
      );
    elsif new.price < old.price then
      perform private.notify_family_role(
        new.family_id,
        'child',
        '「' || new.title || '」が ねさがりしたよ',
        'ストアで みてみよう。',
        'store',
        'store_item_price_down:' || new.id::text || ':' || new.price::text
      );
    end if;
  exception when others then
    raise warning 'お知らせを作れませんでした（ストアの商品 %）: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_store_item_change_after_write on public.store_items;
create trigger notify_store_item_change_after_write
after insert or update of price, stock, is_active on public.store_items
for each row execute function private.notify_store_item_change();

-- 9. 権限 ---------------------------------------------------------------------------------
-- どれもトリガーとDB内の関数からだけ呼ぶ。アプリ（anon / authenticated）からは呼ばせない。
revoke all on function private.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.notify_family_role(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.notification_user_name(uuid) from public, anon, authenticated;
revoke all on function private.notify_quest_log_pending() from public, anon, authenticated;
revoke all on function private.notify_task_report_pending() from public, anon, authenticated;
revoke all on function private.notify_store_item_request_pending() from public, anon, authenticated;
revoke all on function private.notify_quest_streak_milestone() from public, anon, authenticated;
revoke all on function private.notify_store_item_change() from public, anon, authenticated;
