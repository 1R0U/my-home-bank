-- Issue #264: CIの一時DB専用。本番では実行しない。
\set ON_ERROR_STOP on
\o /dev/null
begin;
create or replace function pg_temp.assert(p_condition boolean, p_label text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'アサーション失敗: %', p_label; end if;
  raise notice 'OK  %', p_label;
end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_label text)
returns void language plpgsql as $$ begin
  begin execute p_sql;
  exception when others then raise notice 'OK  %（%）', p_label, sqlerrm; return; end;
  raise exception '拒否されるはずが成功: %', p_label;
end; $$;

-- 一覧への書き足し忘れを、DBの実物から検出する（今後のテーブルも対象）。
create function pg_temp.assert_child_session_policies()
returns void language plpgsql as $$
declare v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
    and not exists (
      select 1 from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname
        and p.policyname = c.relname || '_active_child_session' and p.permissive = 'RESTRICTIVE'
        and p.cmd = 'ALL' and (p.roles @> array['authenticated']::name[] or p.roles @> array['public']::name[])
        and p.qual like '%current_child_session_is_valid()%'
        and p.with_check like '%current_child_session_is_valid()%'
    );
  if v_missing is not null then raise exception '子供セッション保護ポリシーの不足: %', v_missing; end if;
end; $$;
select pg_temp.assert_child_session_policies();

-- 検査自体が空振りしないことを、新しいテーブルの付け忘れ・誤設定で確認する。
create table public.child_session_coverage_probe(id integer);
alter table public.child_session_coverage_probe enable row level security;
select pg_temp.assert_rejected('select pg_temp.assert_child_session_policies()', '新しいテーブルの保護漏れを検出する');
create policy child_session_coverage_probe_active_child_session on public.child_session_coverage_probe
  for all to authenticated using (public.current_child_session_is_valid()) with check (public.current_child_session_is_valid());
select pg_temp.assert_rejected('select pg_temp.assert_child_session_policies()', 'permissiveでは保護済みと扱わない');
drop policy child_session_coverage_probe_active_child_session on public.child_session_coverage_probe;
create policy child_session_coverage_probe_active_child_session on public.child_session_coverage_probe
  as restrictive for all to authenticated using (true) with check (true);
select pg_temp.assert_rejected('select pg_temp.assert_child_session_policies()', '名前だけ正しいポリシーも検出する');
alter policy child_session_coverage_probe_active_child_session on public.child_session_coverage_probe
  using (public.current_child_session_is_valid()) with check (public.current_child_session_is_valid());
select pg_temp.assert_child_session_policies();
drop table public.child_session_coverage_probe;

insert into public.families (id, name) values
 ('26410000-0000-4000-8000-000000000001', 'コード家庭A'),
 ('26410000-0000-4000-8000-000000000002', 'コード家庭B');
insert into public.users (id, family_id, name, role, balance) values
 ('26410000-0000-4000-8000-000000000011', '26410000-0000-4000-8000-000000000001', '親A', 'parent', 0),
 ('26410000-0000-4000-8000-000000000013', '26410000-0000-4000-8000-000000000001', '同家庭の別の親', 'parent', 0),
 ('26410000-0000-4000-8000-000000000021', '26410000-0000-4000-8000-000000000002', '親B', 'parent', 0);
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000011', true);
select public.prepare_child_account('子A') as child_email \gset
select public.prepare_child_account('きょうだい') as sibling_email \gset
reset role;
insert into auth.users(id, email) values
 ('26410000-0000-4000-8000-000000000012', :'child_email'),
 ('26410000-0000-4000-8000-000000000014', :'sibling_email');

set role anon;
select pg_temp.assert_rejected($q$select public.issue_child_login_code('26410000-0000-4000-8000-000000000012')$q$, '匿名は発行できない');
select pg_temp.assert_rejected($q$select public.consume_child_login_code(repeat('a',64),repeat('b',64))$q$, '匿名は管理者RPCを呼べない');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000012', true);
select pg_temp.assert_rejected($q$select public.issue_child_login_code('26410000-0000-4000-8000-000000000014')$q$, '子供は発行できない');
select pg_temp.assert_rejected($q$select public.finish_child_login(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())$q$, '本人でもセッションを登録できない');
select pg_temp.assert_rejected($q$select * from private.child_login_codes$q$, 'コードのハッシュは読めない');
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000021', true);
select pg_temp.assert_rejected($q$select public.issue_child_login_code('26410000-0000-4000-8000-000000000012')$q$, '別家庭の親は発行できない');
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000011', true);
select pg_temp.assert_rejected($q$select public.issue_child_login_code('26410000-0000-4000-8000-000000000013')$q$, '親向けには発行できない');
select public.issue_child_login_code('26410000-0000-4000-8000-000000000012') as issued \gset
select pg_temp.assert(:'issued'::jsonb->>'code' ~ '^[A-HJ-NP-Z2-9]{8}$', 'コードは見分けやすい8文字');
select pg_temp.assert((:'issued'::jsonb->>'expiresAt')::timestamptz = now() + interval '10 minutes', '10分で失効する');
select pg_temp.assert_rejected($q$select public.issue_child_login_code('26410000-0000-4000-8000-000000000012')$q$, '30秒以内の連続発行は拒否する');
reset role;
select pg_temp.assert((select code_hash = encode(sha256(convert_to(:'issued'::jsonb->>'code','UTF8')),'hex')
 from private.child_login_codes where child_id = '26410000-0000-4000-8000-000000000012'), '平文を保存せずSHA-256を保存する');
update private.child_login_codes set created_at = now() - interval '1 minute';
set role authenticated;
select public.issue_child_login_code('26410000-0000-4000-8000-000000000012') as reissued \gset
reset role;
select pg_temp.assert(public.consume_child_login_code(encode(sha256(convert_to(:'issued'::jsonb->>'code','UTF8')),'hex'),repeat('a',64))->>'error' = 'invalid_code', '再発行前のコードは使えない');
update private.child_login_codes set expires_at = now() - interval '1 second';
select pg_temp.assert(public.consume_child_login_code(encode(sha256(convert_to(:'reissued'::jsonb->>'code','UTF8')),'hex'),repeat('a',64))->>'error' = 'invalid_code', '期限切れのコードは使えない');
update private.child_login_codes set expires_at = now() + interval '10 minutes';
set role service_role;
select public.consume_child_login_code(encode(sha256(convert_to(:'reissued'::jsonb->>'code','UTF8')),'hex'),repeat('a',64)) as claim \gset
select pg_temp.assert(:'claim'::jsonb->>'childId' = '26410000-0000-4000-8000-000000000012', '既存の同じ子供IDに入る');
select pg_temp.assert(:'claim'::jsonb->>'email' = :'child_email', '内部メールは管理者RPCだけに返す');
select pg_temp.assert(public.consume_child_login_code(encode(sha256(convert_to(:'reissued'::jsonb->>'code','UTF8')),'hex'),repeat('a',64))->>'error' = 'invalid_code', '二度目の消費を拒否する');
select pg_temp.assert(not public.finish_child_login('26410000-0000-4000-8000-000000000012', gen_random_uuid(), gen_random_uuid()), '違う予約からセッションを設定できない');
reset role;
set role authenticated;
select pg_temp.assert_rejected($q$select public.issue_child_login_code('26410000-0000-4000-8000-000000000012')$q$, '認証中の並列発行を拒否する');
reset role;
select pg_temp.assert(public.finish_child_login('26410000-0000-4000-8000-000000000012', (:'claim'::jsonb->>'attemptId')::uuid, '26410000-0000-4000-8000-000000000101'), '最初のセッションを有効にする');
select pg_temp.assert(public.complete_child_login('26410000-0000-4000-8000-000000000012', (:'claim'::jsonb->>'attemptId')::uuid), 'Auth失効後に予約を確定する');

set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000012', true);
select set_config('request.jwt.claims', '{"session_id":"26410000-0000-4000-8000-000000000101"}', true);
select pg_temp.assert(public.current_child_session_is_valid(), '登録したセッションは使える');
select pg_temp.assert((select count(*) from public.bank_accounts) = 1, '子供は本人の口座だけ読める');
select set_config('request.jwt.claims', '{"session_id":"26410000-0000-4000-8000-000000000102"}', true);
select pg_temp.assert(not public.current_child_session_is_valid(), '他のセッションは無効');
select pg_temp.assert((select count(*) from public.bank_accounts) = 0, '失効したJWTはRLSでも読めない');
select pg_temp.assert_rejected('select public.check_child_session()', 'PostgRESTフックは失効したJWTのRPCを拒否する');
reset role;

update private.child_login_codes set created_at = now() - interval '1 minute';
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000011', true);
select public.issue_child_login_code('26410000-0000-4000-8000-000000000012') as new_code \gset
reset role;
select public.consume_child_login_code(encode(sha256(convert_to(:'new_code'::jsonb->>'code','UTF8')),'hex'),repeat('a',64)) as new_claim \gset
select public.finish_child_login('26410000-0000-4000-8000-000000000012', (:'new_claim'::jsonb->>'attemptId')::uuid, '26410000-0000-4000-8000-000000000102');
select public.complete_child_login('26410000-0000-4000-8000-000000000012', (:'new_claim'::jsonb->>'attemptId')::uuid);
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000012', true);
select pg_temp.assert(public.current_child_session_is_valid(), '入り直した新端末は使える');
select set_config('request.jwt.claims', '{"session_id":"26410000-0000-4000-8000-000000000101"}', true);
select pg_temp.assert(not public.current_child_session_is_valid(), '期限内の古いJWTでも直ちに拒否する');
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert(not public.current_child_session_is_valid(), 'session_idのない子供JWTは拒否する');
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000011', true);
select pg_temp.assert((select count(*) from public.bank_accounts) = 3, '親は本人と同じ家庭の子供の口座を読める');
select pg_temp.assert((select count(*) from public.bank_accounts where user_id = '26410000-0000-4000-8000-000000000013') = 0, '同家庭でも別の親の口座は読めない');
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000021', true);
select pg_temp.assert((select count(*) from public.bank_accounts where user_id = '26410000-0000-4000-8000-000000000012') = 0, '別家庭の子供の口座は読めない');
reset role;

-- 取引の参照も同じ境界になることを、専用の行で確認する。
insert into public.transactions(user_id,type,amount,description) values
 ('26410000-0000-4000-8000-000000000012','bank_interest',1,'子の取引'),
 ('26410000-0000-4000-8000-000000000013','bank_interest',1,'別の親の取引');
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000011', true);
select pg_temp.assert((select count(*) from public.transactions where user_id = '26410000-0000-4000-8000-000000000012') = 1, '親は同家庭の子の取引を読める');
select pg_temp.assert((select count(*) from public.transactions where user_id = '26410000-0000-4000-8000-000000000013') = 0, '別の親の取引は読めない');
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000021', true);
select pg_temp.assert((select count(*) from public.transactions where user_id = '26410000-0000-4000-8000-000000000012') = 0, '別家庭の子の取引は読めない');
reset role;

do $$ begin
 for i in 1..10 loop perform public.consume_child_login_code(repeat('c',64), repeat('d',64)); end loop;
 perform pg_temp.assert(public.consume_child_login_code(repeat('c',64),repeat('d',64))->>'error' = 'rate_limited', '同一送信元の11回目を拒否する');
end; $$;
-- 制限済みの同一送信元が全体枠を消費して他の家庭を止めない。
select attempts as global_before from private.child_login_attempts where bucket_key = 'global' \gset
do $$ begin
 for i in 1..3000 loop perform public.consume_child_login_code(repeat('c',64), repeat('d',64)); end loop;
end; $$;
select pg_temp.assert((select attempts from private.child_login_attempts where bucket_key = 'global') = :'global_before'::integer, '同一送信元の拒否は全体枠を使わない');
select pg_temp.assert(public.consume_child_login_code(repeat('c',64),repeat('f',64))->>'error' = 'invalid_code', '別の送信元は引き続き試せる');
update private.child_login_attempts set attempts = 2999 where bucket_key = 'global';
select pg_temp.assert(public.consume_child_login_code(repeat('c',64),repeat('f',64))->>'error' = 'invalid_code', '全体3000回目までは試せる');
select pg_temp.assert(public.consume_child_login_code(repeat('c',64),repeat('e',64))->>'error' = 'rate_limited', '送信元を替えても全体上限を超えられない');
select pg_temp.assert(not exists (select 1 from private.child_login_attempts where bucket_key = repeat('e',64)), '全体制限中は送信元別の行を増やさない');

-- 中断されたログインの後始末と、遅れた応答の拒否。
insert into private.child_login_sessions(child_id, active_session_id, attempt_id, attempt_expires_at)
values ('26410000-0000-4000-8000-000000000014', null,
 '26410000-0000-4000-8000-000000000201', now() - interval '1 second');
select pg_temp.assert(not public.finish_child_login('26410000-0000-4000-8000-000000000014',
 '26410000-0000-4000-8000-000000000201', gen_random_uuid()), '期限切れの認証応答は有効にしない');
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000014', true);
select pg_temp.assert(not public.current_child_session_is_valid(), '認証が完了していない子供はsession_idなしでも拒否する');
reset role;
select pg_temp.assert(public.finish_child_login('26410000-0000-4000-8000-000000000014',
 '26410000-0000-4000-8000-000000000201', null), '失効した予約も後始末できる');

update private.child_login_sessions set attempt_id = '26410000-0000-4000-8000-000000000202',
 attempt_expires_at = now() + interval '1 minute' where child_id = '26410000-0000-4000-8000-000000000012';
insert into auth.sessions(id, user_id) values ('26410000-0000-4000-8000-000000000102', '26410000-0000-4000-8000-000000000012');
select public.finish_child_login('26410000-0000-4000-8000-000000000012', '26410000-0000-4000-8000-000000000202', '26410000-0000-4000-8000-000000000103');
select public.finish_child_login('26410000-0000-4000-8000-000000000012', '26410000-0000-4000-8000-000000000202', '26410000-0000-4000-8000-000000000103');
set role authenticated;
select set_config('request.jwt.claim.sub', '26410000-0000-4000-8000-000000000012', true);
select set_config('request.jwt.claims', '{"session_id":"26410000-0000-4000-8000-000000000102"}', true);
select pg_temp.assert(public.current_child_session_is_valid(), '仮切替中は旧端末を維持する');
reset role;
delete from auth.sessions where id = '26410000-0000-4000-8000-000000000102';
set role authenticated;
select pg_temp.assert(not public.current_child_session_is_valid(), 'Auth失効後は確定処理前でも旧端末を拒否する');
reset role;
insert into auth.sessions(id, user_id) values ('26410000-0000-4000-8000-000000000102', '26410000-0000-4000-8000-000000000012');
update private.child_login_sessions set attempt_expires_at = now() - interval '1 second'
 where child_id = '26410000-0000-4000-8000-000000000012';
set role authenticated;
select pg_temp.assert(not public.current_child_session_is_valid(), '期限切れの仮切替は旧端末を許可しない');
reset role;
select public.finish_child_login('26410000-0000-4000-8000-000000000012', '26410000-0000-4000-8000-000000000202', null);
select pg_temp.assert((select active_session_id = '26410000-0000-4000-8000-000000000102'::uuid
 from private.child_login_sessions where child_id = '26410000-0000-4000-8000-000000000012'), '仮切替の再送後でもAuth失敗時は旧セッションを復元する');
rollback;
\o
\echo '=== 子供のコードログイン・セッション・親の参照権限を確認しました ==='
