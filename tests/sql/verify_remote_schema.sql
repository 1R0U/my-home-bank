-- Issue #187: 稼働中のDBが全マイグレーションを反映しているか確認する ------------------
--
-- Supabaseダッシュボードの SQL Editor で、稼働中のプロジェクトに対して実行する。
-- 読み取り専用。何も変更しない。
--
-- テーブル・列・関数・トリガー・インデックス・RLS・ポリシーの有無だけでなく、
-- 関数の中身が最新版かどうか（pg_proc.prosrc の内容）も見る。テーブルや列が
-- 存在していても、関数が古い版のままだと機能が正しく動かないため。
--
-- 全マイグレーション適用済みのDBでは全行 OK になることを確認済み
-- （ローカルのPostgreSQL 16、2026-09-17時点の全16マイグレーション適用後）。

-- bank_accounts.user_id の重複を確認するヘルパー。
-- 通常のSQLは case で囲んでもテーブル参照を実行前に解決しようとするため、
-- bank_accounts が存在しない環境ではそれだけでクエリ全体が失敗し、他の
-- チェック結果も道連れで得られなくなる。execute による動的SQLで、
-- テーブルの存在を確認した後にだけ問い合わせを組み立てて実行する。
-- pg_temp はこのセッション内だけで有効で、他のセッションやDBには残らない。
create or replace function pg_temp.check_bank_accounts_duplicates()
returns text
language plpgsql
as $$
declare
  v_result text;
begin
  if to_regclass('public.bank_accounts') is null then
    return '❌ テーブルがない';
  end if;

  execute '
    select case when exists (
      select 1 from public.bank_accounts group by user_id having count(*) > 1
    ) then ''❌ 重複あり'' else ''OK'' end
  ' into v_result;

  return v_result;
end;
$$;

select * from (
  -- 1. テーブル
  select 'テーブル' as 種別, t as 対象,
         case when to_regclass('public.' || t) is not null then 'OK' else '❌ 欠落' end as 判定
  from unnest(array[
    'users', 'quests', 'quest_logs', 'transactions',
    'bank_accounts', 'store_item_requests', 'task_reports',
    'families', 'guild_treasuries', 'economy_transactions',
    'placed_decorations', 'owned_items', 'equipped_items'
  ]) as t

  union all

  -- 2. 後続マイグレーションが追加した列
  select '列', c.tbl || '.' || c.col,
         case when exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = c.tbl and column_name = c.col
         ) then 'OK' else '❌ 欠落' end
  from (values
    ('users', 'notifications_enabled'),
    ('users', 'family_id'),
    ('quests', 'category'),
    ('quests', 'assigned_to'),
    ('transactions', 'quest_log_id'),
    ('bank_accounts', 'deposit_balance'),
    ('bank_accounts', 'loan_balance'),
    ('bank_accounts', 'interest_rate'),
    ('bank_accounts', 'loan_rate')
  ) as c(tbl, col)

  union all

  -- 3. 関数(RPC、publicスキーマ)
  select '関数', f,
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = f
         ) then 'OK' else '❌ 欠落' end
  from unnest(array[
    'approve_quest_log', 'reject_quest_log', 'submit_quest_completion',
    'bank_deposit', 'bank_withdraw', 'bank_borrow', 'bank_repay',
    'create_bank_account_for_new_user',
    'current_user_family_id', 'create_family_with_treasury', 'issue_treasury_hmc'
  ]) as f

  union all

  -- 3b. 関数(privateスキーマ)
  -- issue_treasury_hmc / create_family_with_treasury は内部で
  -- private.transfer_treasury_wallet を呼ぶ。private側が欠けていると
  -- public側の関数はOKでも実行時に落ちるため、個別に確認する。
  select '関数', 'private.' || f,
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname = f
         ) then 'OK' else '❌ 欠落' end
  from unnest(array[
    'safe_integer_max', 'transfer_treasury_wallet', 'protect_user_family_id'
  ]) as f

  union all

  -- 4. トリガー
  select 'トリガー', 'create_bank_account_after_user_insert',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'create_bank_account_after_user_insert' and not tgisinternal
         ) then 'OK' else '❌ 欠落' end

  union all

  select 'トリガー', 'protect_user_family_id_on_write',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'protect_user_family_id_on_write' and not tgisinternal
         ) then 'OK' else '❌ 欠落' end

  union all

  -- 5. 一意インデックス(重複防止の要)
  -- 名前の存在・一意性だけでなく、schemaも public に限定する。
  -- 限定しないと、別スキーマにある同名インデックス（一意でも非一意でも）を
  -- 拾ってしまい、本来見るべき public 側の状態と無関係に判定してしまう。
  select 'インデックス', i,
         case
           when not exists (
             select 1 from pg_indexes where schemaname = 'public' and indexname = i
           ) then '❌ 欠落'
           when exists (
             select 1 from pg_index idx
             join pg_class c on c.oid = idx.indexrelid
             where c.relnamespace = 'public'::regnamespace
               and c.relname = i and idx.indisunique
           ) then 'OK'
           else '❌ 一意でない'
         end
  from unnest(array[
    'transactions_quest_log_id_unique',
    'bank_accounts_user_id_unique'
  ]) as i

  union all

  -- 6. 関数が最新版か
  -- 20260907000000 で預入・引き出し・返済も transactions へ記帳する版に差し替えた。
  -- 古い版のままだと、振替が履歴に残らない。
  -- lower() で大小文字の揺れを吸収する（将来の書き換えで大文字を使われても
  -- 誤って「古い版」と判定しないように）。
  select '関数の版', fn || ' が取引を記帳する版か',
    case
      when not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = fn
      ) then '❌ 関数がない'
      when lower((
        select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = fn limit 1
      )) like '%insert into%transactions%' then 'OK'
      else '❌ 古い版'
    end
  from unnest(array['bank_deposit', 'bank_withdraw', 'bank_repay']) as fn

  union all

  -- 7. 制約が最新版か
  -- 20260907000000 で銀行3種（bank_deposit/bank_withdraw/bank_repay）すべてを
  -- type の CHECK に追加した。3種のうちどれか1つでも欠けていないか確認する。
  select '制約の版', 'transactions_type_check が銀行3種すべてを許可するか',
    case
      when not exists (
        select 1 from pg_constraint
        where conname = 'transactions_type_check'
          and connamespace = 'public'::regnamespace
      ) then '❌ 制約がない'
      else (
        with def as (
          select pg_get_constraintdef(oid) as d
          from pg_constraint
          where conname = 'transactions_type_check'
            and connamespace = 'public'::regnamespace
          limit 1
        )
        select case
          when d like '%bank_deposit%' and d like '%bank_withdraw%' and d like '%bank_repay%'
          then 'OK' else '❌ 古い版'
        end
        from def
      )
    end

  union all

  -- 8. 承認処理が残高加算のガードを持つか(20260831050000 の修正)
  select '関数の版', 'approve_quest_log が記帳時のみ加算する版か',
    case
      when not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'approve_quest_log'
      ) then '❌ 関数がない'
      when lower((
        select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'approve_quest_log' limit 1
      )) like '%get diagnostics%' then 'OK'
      else '❌ 古い版'
    end

  union all

  -- 9. RLSが有効か
  -- 欠けていても他のチェックは「動かない」ことで気づけるが、RLSの欠落だけは
  -- 何事もなく動いたまま他家庭のデータが見えてしまう、最も気づきにくい
  -- ドリフトのため個別に確認する。
  select 'RLS', t,
         case when coalesce((
           select c.relrowsecurity from pg_class c
           where c.oid = to_regclass('public.' || t)
         ), false) then 'OK' else '❌ 無効' end
  from unnest(array['families', 'guild_treasuries', 'economy_transactions']) as t

  union all

  -- 10. ポリシーがあるか
  select 'ポリシー', p,
         case when exists (
           select 1 from pg_policies where schemaname = 'public' and policyname = p
         ) then 'OK' else '❌ 欠落' end
  from unnest(array[
    'families_select_own', 'guild_treasuries_select_own', 'economy_transactions_select_own'
  ]) as p

  union all

  -- 11. bank_accounts.user_id に重複がないか(一意インデックス作成の前提)
  select 'データ整合性', 'bank_accounts.user_id に重複がない',
         pg_temp.check_bank_accounts_duplicates()
) x
order by
  case 種別
    when 'テーブル' then 1 when '列' then 2 when '関数' then 3
    when 'トリガー' then 4 when 'インデックス' then 5
    when '関数の版' then 6 when '制約の版' then 7
    when 'RLS' then 8 when 'ポリシー' then 9
    when 'データ整合性' then 10 else 11 end,
  対象;
