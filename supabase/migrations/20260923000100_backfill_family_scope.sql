-- Issue #208: 既存の「1プロジェクト＝1家庭」データをfamily_idへ紐付ける。
-- 新しい複数家庭データを推測で混ぜないよう、所有者同士の家庭が食い違う行は停止する。

do $$
declare
  v_legacy_family_id constant uuid := '00000000-0000-4000-8000-000000000208';
  v_initial_supply constant bigint := 10000;
  v_existing_holdings numeric;
  v_has_unscoped_legacy_users boolean;
  v_has_unscoped_non_guest_users boolean;
begin
  select exists (
    select 1
    from public.users u
    where u.family_id is null
      and not exists (select 1 from auth.users au where au.id = u.id)
  ) into v_has_unscoped_legacy_users;

  select exists (
    select 1
    from public.users u
    where u.family_id is null
      and not exists (select 1 from auth.users au where au.id = u.id)
      and u.id not in (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002'
      )
  ) into v_has_unscoped_non_guest_users;

  -- 固定ゲストは本番にも存在するが、実利用者とは別の専用家庭へ安全に隔離できる。
  -- それ以外の旧利用者は所属先を推測できないため、既存家庭がある場合は適用を止める。
  if v_has_unscoped_non_guest_users
     and exists (select 1 from public.families) then
    raise exception '家庭未設定の旧利用者がいます。既存家庭への所属を確認してからfamily_idを設定してください';
  end if;

  if v_has_unscoped_legacy_users then
    insert into public.families (id, name)
    values (v_legacy_family_id, '既存の家庭')
    on conflict (id) do nothing;
  end if;

  -- Auth利用者は初回ログイン時に自分の家庭を作るため補完しない。
  -- Authを持たないfamily導入前の利用者だけを、従来の1家庭として補完する。
  update public.users u
  set family_id = v_legacy_family_id
  where u.family_id is null
    and not exists (select 1 from auth.users au where au.id = u.id);

  -- family_idだけを補完すると、次回ログイン時に「家庭はあるが金庫がない」状態となり、
  -- 新規家庭作成も実行されない。既存残高を総供給量へ含めた金庫も同時に用意する。
  if exists (select 1 from public.users where family_id = v_legacy_family_id)
     and not exists (
       select 1 from public.guild_treasuries where family_id = v_legacy_family_id
     ) then
    select
      coalesce((select sum(balance) from public.users where family_id = v_legacy_family_id), 0)
      + coalesce((
          select sum(a.deposit_balance)
          from public.bank_accounts a
          join public.users u on u.id = a.user_id
          where u.family_id = v_legacy_family_id
        ), 0)
    into v_existing_holdings;

    if v_existing_holdings < 0
       or v_existing_holdings <> trunc(v_existing_holdings)
       or v_existing_holdings > private.safe_integer_max() - v_initial_supply then
      raise exception '既存家庭のWallet・預金残高を安全な整数の総供給量へ移行できません';
    end if;

    insert into public.guild_treasuries
      (family_id, balance, initial_supply, total_supply)
    values (
      v_legacy_family_id,
      v_initial_supply,
      v_initial_supply,
      v_initial_supply + v_existing_holdings::bigint
    );

    insert into public.economy_transactions (
      family_id, type, from_account_type, to_account_type,
      amount, description, idempotency_key
    ) values (
      v_legacy_family_id, 'treasury_initialization', 'system', 'treasury',
      v_initial_supply, '既存家庭のギルド金庫初期HMC', 'issue-208:legacy-family'
    );
  end if;

  if exists (
    select 1
    from public.quests q
    join public.users creator on creator.id = q.created_by
    join public.users assignee on assignee.id = q.assigned_to
    where creator.family_id is distinct from assignee.family_id
  ) then
    raise exception 'questsに作成者と受注者の家庭が異なる行があります';
  end if;

  update public.quests q
  set family_id = creator.family_id
  from public.users creator
  where q.family_id is null
    and creator.id = q.created_by
    and creator.family_id is not null;

  update public.quests q
  set family_id = assignee.family_id
  from public.users assignee
  where q.family_id is null
    and assignee.id = q.assigned_to
    and assignee.family_id is not null;

  if exists (
    select 1
    from public.quest_logs ql
    join public.quests q on q.id = ql.quest_id
    join public.users u on u.id = ql.user_id
    where q.family_id is distinct from u.family_id
  ) then
    raise exception 'quest_logsにクエストと報告者の家庭が異なる行があります';
  end if;

  update public.quest_logs ql
  set family_id = q.family_id
  from public.quests q
  where ql.family_id is null and q.id = ql.quest_id;

  update public.store_item_requests r
  set family_id = u.family_id
  from public.users u
  where r.family_id is null and u.id = r.requested_by;

  update public.task_reports r
  set family_id = u.family_id
  from public.users u
  where r.family_id is null and u.id = r.reported_by;

  update public.store_items i
  set family_id = u.family_id
  from public.users u
  where i.family_id is null and u.id = i.requested_by;

  -- store_items.requested_byは旧データでNULLを許していたため、所有者不明の行だけ
  -- 従来の1家庭へ補完する。
  update public.store_items
  set family_id = v_legacy_family_id
  where family_id is null
    and exists (
      select 1 from public.families where id = v_legacy_family_id
    );
end;
$$;
