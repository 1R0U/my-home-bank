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
update private.child_login_attempts set attempts = 300 where bucket_key = 'global';
select pg_temp.assert(public.consume_child_login_code(repeat('c',64),repeat('e',64))->>'error' = 'rate_limited', '送信元を替えても全体上限を超えられない');
rollback;
\o
\echo '=== 子供のコードログイン・セッション・親の参照権限を確認しました ==='
