-- Issue #348: 子供ごとの機能の使う・使わない（child_feature_restrictions）を確認する。
\set ON_ERROR_STOP on
\o /dev/null

begin;

create function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'アサーション失敗: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end;
$$;

create function pg_temp.assert_rejected(p_sql text, p_expected text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'アサーション失敗: % （想定と違う理由で拒否された: %）', p_label, sqlerrm;
    end if;
    raise notice 'OK  %（拒否された: %）', p_label, sqlerrm;
    return;
  end;
  raise exception 'アサーション失敗: 拒否されるはずが成功した: %', p_label;
end;
$$;

create function pg_temp.restricted(p_user_id uuid, p_feature text)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.child_feature_restrictions where user_id = p_user_id and feature = p_feature
  );
$$;

insert into public.families (id, name) values
  ('34800000-0000-4000-8000-000000000001', '348家庭'),
  ('34800000-0000-4000-8000-000000000002', '348別の家庭');

insert into public.users (id, family_id, name, role, balance) values
  ('34800000-0000-4000-8000-000000000011', '34800000-0000-4000-8000-000000000001', '348の親', 'parent', 0),
  ('34800000-0000-4000-8000-000000000012', '34800000-0000-4000-8000-000000000001', '348の子A', 'child', 0),
  ('34800000-0000-4000-8000-000000000013', '34800000-0000-4000-8000-000000000001', '348の子B', 'child', 0),
  ('34800000-0000-4000-8000-000000000021', '34800000-0000-4000-8000-000000000002', '348別の親', 'parent', 0),
  ('34800000-0000-4000-8000-000000000022', '34800000-0000-4000-8000-000000000002', '348別の子', 'child', 0);

-- 親が切り替える ------------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '34800000-0000-4000-8000-000000000011', true);

select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'bank', false);
select pg_temp.assert(
  pg_temp.restricted('34800000-0000-4000-8000-000000000012', 'bank'),
  '親は、子供の銀行を使わないにできる'
);
select pg_temp.assert(
  not pg_temp.restricted('34800000-0000-4000-8000-000000000013', 'bank'),
  '使わないにしたのはその子供だけで、ほかの子供は使える'
);

-- もうそうなっていれば何もしない（エラーにしない）
select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'bank', false);
select pg_temp.assert(
  (select count(*) = 1 from public.child_feature_restrictions
   where user_id = '34800000-0000-4000-8000-000000000012'),
  '同じ切り替えを2回しても、行は増えない'
);

select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000013', 'bank', true);
select pg_temp.assert(
  not pg_temp.restricted('34800000-0000-4000-8000-000000000013', 'bank'),
  'もともと使える子供を使うにしても、何も変わらない'
);

select pg_temp.assert_rejected(
  $q$select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'store', false)$q$,
  '切り替えられない機能',
  '切り替えの対象でない機能は断る'
);
select pg_temp.assert_rejected(
  $q$select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'bank', null)$q$,
  '使うか使わないか',
  '使うか使わないかが無ければ断る'
);
select pg_temp.assert_rejected(
  $q$select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000011', 'bank', false)$q$,
  '同じ家族の子供だけ',
  '親自身は対象にできない'
);
select pg_temp.assert_rejected(
  $q$select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000022', 'bank', false)$q$,
  '同じ家族の子供だけ',
  '別の家族の子供は対象にできない'
);
select pg_temp.assert_rejected(
  $q$insert into public.child_feature_restrictions (family_id, user_id, feature)
     values ('34800000-0000-4000-8000-000000000001', '34800000-0000-4000-8000-000000000013', 'bank')$q$,
  'permission denied',
  'テーブルへ直接は書き込めない（RPCを通す）'
);

-- 子供は切り替えられないが、自分の設定は見られる ------------------------------------------------
select set_config('request.jwt.claim.sub', '34800000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected(
  $q$select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'bank', true)$q$,
  '親だけ',
  '子供は自分の機能を使うに戻せない'
);
select pg_temp.assert(
  (select count(*) = 1 from public.child_feature_restrictions
   where user_id = '34800000-0000-4000-8000-000000000012' and feature = 'bank'),
  '子供は自分が使えない機能を見られる'
);

-- 別の家族からは見えない ----------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '34800000-0000-4000-8000-000000000021', true);
select pg_temp.assert(
  (select count(*) = 0 from public.child_feature_restrictions),
  '別の家族の設定は見えない'
);
select pg_temp.assert_rejected(
  $q$select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'bank', true)$q$,
  '同じ家族の子供だけ',
  '別の家族の親は切り替えられない'
);

-- 使うに戻す ----------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '34800000-0000-4000-8000-000000000011', true);
select public.set_child_feature_enabled('34800000-0000-4000-8000-000000000012', 'bank', true);
select pg_temp.assert(
  not pg_temp.restricted('34800000-0000-4000-8000-000000000012', 'bank'),
  '親は、子供の銀行を使うに戻せる'
);
reset role;

rollback;
