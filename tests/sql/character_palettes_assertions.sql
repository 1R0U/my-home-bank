-- Issue #381 / #383: 種類別の色保存、旧カエル色の補完、本人だけのアクセスを検証する。
-- assertions.sql の pg_temp.assert / assert_sqlstate を使用する。

\echo '=== 12. キャラクターの種類別の色と既存カエル色の補完 ==='

begin;

create function pg_temp.palette_affected_rows(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

insert into public.families (id, name) values
  ('38300000-0000-4000-8000-000000000001', '色検証家庭A'),
  ('38300000-0000-4000-8000-000000000002', '色検証家庭B');

insert into public.users (id, family_id, name, role, balance) values
  ('38300000-0000-4000-8000-000000000011', '38300000-0000-4000-8000-000000000001', '旧カエル色の本人', 'child', 0),
  ('38300000-0000-4000-8000-000000000012', '38300000-0000-4000-8000-000000000001', '猫選択中の旧色', 'child', 0),
  ('38300000-0000-4000-8000-000000000013', '38300000-0000-4000-8000-000000000001', '色未設定の本人', 'child', 0),
  ('38300000-0000-4000-8000-000000000014', '38300000-0000-4000-8000-000000000001', '新形式保存済みの本人', 'child', 0),
  ('38300000-0000-4000-8000-000000000021', '38300000-0000-4000-8000-000000000002', '別家庭の本人', 'child', 0);

insert into public.character_appearances (
  user_id, character_type, accent_color, hair_color, skin_color, updated_at
) values
  ('38300000-0000-4000-8000-000000000011', 'frog', '#2f7a2a', null, '#4fae3f', '2026-09-30 00:00:00+00'),
  ('38300000-0000-4000-8000-000000000012', 'cat', '#e36c61', '#412a16', '#ffffff', '2026-09-30 01:00:00+00'),
  ('38300000-0000-4000-8000-000000000013', 'frog', null, null, null, '2026-09-30 02:00:00+00'),
  ('38300000-0000-4000-8000-000000000014', 'rabbit', '#2f7a2a', null, '#4fae3f', '2026-09-30 03:00:00+00');

insert into public.character_palettes (
  user_id, character_type, skin_color, updated_at
) values
  ('38300000-0000-4000-8000-000000000014', 'frog', '#123456', '2026-10-01 00:00:00+00'),
  ('38300000-0000-4000-8000-000000000021', 'frog', '#abcdef', '2026-10-01 00:00:00+00');

-- 空DBへの全適用では旧色が存在しないため、既存データを用意して実ファイルを検証する。
\ir ../../supabase/migrations/20261008094954_backfill_frog_character_palettes.sql

select pg_temp.assert(
  (select accent_color = '#2f7a2a' and hair_color is null and skin_color = '#4fae3f'
          and updated_at = '2026-09-30 00:00:00+00'::timestamptz
   from public.character_palettes
   where user_id = '38300000-0000-4000-8000-000000000011' and character_type = 'frog'),
  '既存カエル色と更新日時が移行される'
);
select pg_temp.assert(
  (select accent_color = '#e36c61' and hair_color = '#412a16' and skin_color = '#ffffff'
   from public.character_palettes
   where user_id = '38300000-0000-4000-8000-000000000012' and character_type = 'frog')
  and not exists (
    select 1 from public.character_palettes
    where user_id = '38300000-0000-4000-8000-000000000012' and character_type = 'cat'
  ),
  '現在の種類が猫でも、旧色はカエル用としてだけ移行される'
);
select pg_temp.assert(
  not exists (
    select 1 from public.character_palettes
    where user_id = '38300000-0000-4000-8000-000000000013'
  ),
  '全枠未設定の旧利用者は既定色のまま'
);
select pg_temp.assert(
  (select skin_color = '#123456' and accent_color is null
          and updated_at = '2026-10-01 00:00:00+00'::timestamptz
   from public.character_palettes
   where user_id = '38300000-0000-4000-8000-000000000014' and character_type = 'frog'),
  '新形式で保存済みのカエル色を補完で上書きしない'
);
select pg_temp.assert(
  (select character_type = 'cat' and accent_color = '#e36c61' and hair_color = '#412a16'
          and skin_color = '#ffffff' and updated_at = '2026-09-30 01:00:00+00'::timestamptz
   from public.character_appearances
   where user_id = '38300000-0000-4000-8000-000000000012'),
  '旧形式の色と選択中の種類も互換用に残る'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '38300000-0000-4000-8000-000000000011', true);

select pg_temp.assert(
  (select count(*) from public.character_palettes) = 1,
  '同じ家庭も別家庭も、他の利用者の色は見えない'
);

insert into public.character_palettes (user_id, character_type) values
  ('38300000-0000-4000-8000-000000000011', 'cat'),
  ('38300000-0000-4000-8000-000000000011', 'rabbit'),
  ('38300000-0000-4000-8000-000000000011', 'hamster');
select pg_temp.assert(
  (select count(*) from public.character_palettes) = 4
  and (select accent_color is null and hair_color is null and skin_color is null
       from public.character_palettes where character_type = 'cat'),
  '本人は全4種類を保存でき、未設定枠はNULLになる'
);

update public.character_palettes set skin_color = '#112233'
where character_type = 'frog';
update public.character_palettes set skin_color = '#AABBCC', accent_color = '#ffffff'
where character_type = 'cat';
update public.character_palettes set hair_color = '#445566'
where character_type = 'rabbit';
select pg_temp.assert(
  (select skin_color = '#112233' and accent_color = '#2f7a2a' and hair_color is null
   from public.character_palettes where character_type = 'frog')
  and (select skin_color = '#AABBCC' and accent_color = '#ffffff' and hair_color is null
       from public.character_palettes where character_type = 'cat')
  and (select hair_color = '#445566' and skin_color is null
       from public.character_palettes where character_type = 'rabbit'),
  '種類と枠ごとに色を独立して部分更新できる'
);

select pg_temp.assert(
  pg_temp.palette_affected_rows(
    $q$update public.character_palettes set skin_color = '#999999'
       where user_id in ('38300000-0000-4000-8000-000000000014',
                         '38300000-0000-4000-8000-000000000021')$q$
  ) = 0,
  '同じ家庭でも別家庭でも他の利用者の色は更新できない'
);
select pg_temp.assert_sqlstate(
  $q$insert into public.character_palettes (user_id, character_type)
     values ('38300000-0000-4000-8000-000000000021', 'cat')$q$,
  '42501', '他の利用者の色を新規保存できない'
);
select pg_temp.assert_sqlstate(
  $q$update public.character_palettes set user_id = '38300000-0000-4000-8000-000000000021'
     where character_type = 'cat'$q$,
  '42501', '本人の色を他の利用者の行へ付け替えできない'
);
select pg_temp.assert_sqlstate(
  $q$delete from public.character_palettes where character_type = 'cat'$q$,
  '42501', 'authenticatedは色の行を直接削除できない'
);

reset role;

select pg_temp.assert_sqlstate(
  $q$update public.character_palettes set character_type = 'dragon'
     where user_id = '38300000-0000-4000-8000-000000000011' and character_type = 'cat'$q$,
  '23514', 'カタログに無い種類を拒否する'
);
select pg_temp.assert_sqlstate(
  $q$update public.character_palettes set accent_color = 'green'
     where user_id = '38300000-0000-4000-8000-000000000011' and character_type = 'cat'$q$,
  '23514', 'accentの16進カラーコード以外を拒否する'
);
select pg_temp.assert_sqlstate(
  $q$update public.character_palettes set hair_color = '#gggggg'
     where user_id = '38300000-0000-4000-8000-000000000011' and character_type = 'cat'$q$,
  '23514', 'hairの不正な16進文字を拒否する'
);
select pg_temp.assert_sqlstate(
  $q$update public.character_palettes set skin_color = '#123'
     where user_id = '38300000-0000-4000-8000-000000000011' and character_type = 'cat'$q$,
  '23514', 'skinの不正な桁数を拒否する'
);
select pg_temp.assert_sqlstate(
  $q$insert into public.character_palettes (user_id, character_type)
     values ('38300000-0000-4000-8000-000000000011', 'cat')$q$,
  '23505', '同じ利用者と種類の重複行を拒否する'
);
select pg_temp.assert_sqlstate(
  $q$insert into public.character_palettes (user_id, character_type)
     values ('38399999-0000-4000-8000-000000000999', 'cat')$q$,
  '23503', '存在しない利用者の色を保存できない'
);

-- 新しい色を保存した後で再実行しても、旧色には戻らない。
\ir ../../supabase/migrations/20261008094954_backfill_frog_character_palettes.sql
select pg_temp.assert(
  (select skin_color = '#112233' and accent_color = '#2f7a2a'
   from public.character_palettes
   where user_id = '38300000-0000-4000-8000-000000000011' and character_type = 'frog')
  and (select skin_color = '#123456' and updated_at = '2026-10-01 00:00:00+00'::timestamptz
       from public.character_palettes
       where user_id = '38300000-0000-4000-8000-000000000014' and character_type = 'frog')
  and (select count(*) from public.character_palettes
       where user_id = '38300000-0000-4000-8000-000000000011') = 4,
  '補完を再実行しても保存済みの色・更新日時・種類別行数を維持する'
);

set local role anon;
select pg_temp.assert_sqlstate(
  $q$select * from public.character_palettes$q$,
  '42501', '未ログインでは色を読めない'
);
select pg_temp.assert_sqlstate(
  $q$insert into public.character_palettes (user_id, character_type)
     values ('38300000-0000-4000-8000-000000000013', 'cat')$q$,
  '42501', '未ログインでは色を保存できない'
);
reset role;

delete from public.bank_accounts where user_id = '38300000-0000-4000-8000-000000000011';
delete from public.users where id = '38300000-0000-4000-8000-000000000011';
select pg_temp.assert(
  not exists (
    select 1 from public.character_palettes
    where user_id = '38300000-0000-4000-8000-000000000011'
  ),
  '利用者を削除すると全種類の色が削除される'
);

rollback;
