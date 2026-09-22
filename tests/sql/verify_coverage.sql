-- verify_remote_schema.sql の書き足し忘れを検知する ------------------------------
--
-- verify_remote_schema.sql は「確認したい対象」を手書きの配列で持っている。
-- そのため、マイグレーションでテーブルや関数を足しても、あのファイルへ書き足すのを
-- 忘れると、検査対象から外れたまま全行OKになってしまう。あのファイルを流すだけでは
-- 「載っているものが揃っているか」しか分からず、「載せ忘れ」は素通りする。
--
-- ここでは逆向きに、DBに実在する物が verify_remote_schema.sql の出力に現れているかを
-- 見る。現れていなければ書き足し忘れとして落とす。
--
-- 使い方（CIのDB Migrationジョブが実行する）:
--   psql -t -A -f tests/sql/verify_remote_schema.sql > verify_result.txt
--   psql -f tests/sql/verify_coverage.sql < verify_result.txt
--
-- 結果は標準入力から受け取る。psql は \copy のファイル名に :'変数' を展開しないため、
-- ファイル名を引数で渡すことはできない。
--
-- 全マイグレーションを適用した直後のDBに対して実行することを前提にする。
-- 稼働中のDBに対して流すと、そこにだけ存在する物まで「書き足し忘れ」に見える。
--
-- 対象外:
--   - 列（verify_remote_schema.sql の「2. 後続マイグレーションが追加した列」）。
--     あれは「後から追加された列」だけを挙げており、どの列が後から足されたかは
--     DBの現在の姿からは復元できない。
--   - 関数・制約の「版」の確認（6〜8）。中身が最新かどうかは実在する物の
--     一覧と突き合わせられない。

\set ON_ERROR_STOP on

-- 問い合わせの結果表は読む必要がないため捨てる。raise notice は別の出力先のため残る。
\o /dev/null

create temp table verify_result (種別 text, 対象 text, 判定 text);
\copy verify_result from pstdin with (format text, delimiter '|')

create function pg_temp.assert_covered(p_label text, p_missing text[])
returns void
language plpgsql
as $$
begin
  if array_length(p_missing, 1) is not null then
    raise exception
      'DBにある%が verify_remote_schema.sql に載っていません: % （マイグレーションを足したら、あのファイルにも書き足してください）',
      p_label, array_to_string(p_missing, ', ');
  end if;
  raise notice 'OK  %を網羅している', p_label;
end;
$$;

-- 0. 結果ファイルそのものが壊れていないか。
-- union all のどれか1本が0行を返すようになっても、行数を数えるだけでは気づけるが、
-- 何行が正しいかは対象が増えるたびに変わる。種別が1つでも消えていないかで見る。
do $$
declare
  v_missing text[];
begin
  if not exists (select 1 from verify_result) then
    raise exception 'verify_remote_schema.sql が1行も返していません（クエリ自体が壊れています）';
  end if;

  select array_agg(t order by t) into v_missing
  from unnest(array[
    'テーブル', '列', '関数', 'トリガー', 'インデックス',
    '関数の版', '制約の版', 'RLS', 'ポリシー', 'データ整合性'
  ]) as t
  where not exists (select 1 from verify_result r where r.種別 = t);

  if v_missing is not null then
    raise exception
      'verify_remote_schema.sql の種別「%」が1行も返っていません（その union all が壊れています）',
      array_to_string(v_missing, '」「');
  end if;

  raise notice 'OK  検証クエリが全種別を返している（% 行）', (select count(*) from verify_result);
end;
$$;

-- 1. テーブル
select pg_temp.assert_covered('テーブル', array(
  select table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  except
  select 対象 from verify_result where 種別 = 'テーブル'
  order by 1
));

-- 2. 関数（public / private）
-- verify_remote_schema.sql は private の関数を 'private.' 付きで挙げているため、
-- そちらに合わせて突き合わせる。
select pg_temp.assert_covered('関数', array(
  select case when n.nspname = 'public' then p.proname else n.nspname || '.' || p.proname end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
  except
  select 対象 from verify_result where 種別 = '関数'
  order by 1
));

-- 3. トリガー（内部トリガーと、外部キーのために作られる物は除く）
select pg_temp.assert_covered('トリガー', array(
  select t.tgname
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  except
  select 対象 from verify_result where 種別 = 'トリガー'
  order by 1
));

-- 4. 一意インデックス
-- 主キーや unique 制約が裏で作るインデックスは、制約側で担保されるため除く。
-- create unique index で明示的に作った物だけを対象にする。
select pg_temp.assert_covered('一意インデックス', array(
  select c.relname
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  where c.relnamespace = 'public'::regnamespace
    and i.indisunique
    and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
  except
  select 対象 from verify_result where 種別 = 'インデックス'
  order by 1
));

-- 5. RLSが有効なテーブル
-- 有効にしたのに verify_remote_schema.sql へ書き足し忘れると、あとでRLSが外れても
-- 誰も気づけない。RLSの欠落は「動いてしまう」ぶん最も気づきにくいドリフトのため、
-- 網羅も確認する。
select pg_temp.assert_covered('RLSを有効にしたテーブル', array(
  select c.relname
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and c.relrowsecurity
  except
  select 対象 from verify_result where 種別 = 'RLS'
  order by 1
));

-- 6. ポリシー
select pg_temp.assert_covered('ポリシー', array(
  select policyname
  from pg_policies
  where schemaname = 'public'
  except
  select 対象 from verify_result where 種別 = 'ポリシー'
  order by 1
));

\o
\echo === verify_remote_schema.sql の網羅性を確認しました ===
