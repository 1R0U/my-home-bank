-- Issue #187: 稼働中のDBが全マイグレーションを反映しているか確認する ------------------
--
-- Supabaseダッシュボードの SQL Editor で、稼働中のプロジェクトに対して実行する。
-- 読み取り専用。何も変更しない。
--
-- テーブル・列・関数・トリガー・インデックス・RLS・ポリシーの有無だけでなく、
-- 関数の中身が最新版かどうか（pg_proc.prosrc の内容）も見る。テーブルや列が
-- 存在していても、関数が古い版のままだと機能が正しく動かないため。
--
-- 全マイグレーション適用済みのDBでは全行 OK になる。これはCIのDB Migrationジョブが
-- 毎回確認している（空のDBに全マイグレーションを適用した直後に実行する）。
--
-- 確認したい対象は下の配列に手書きで並べている。マイグレーションで足した物を
-- ここへ書き足し忘れると検査対象から外れてしまうため、その載せ忘れも
-- tests/sql/verify_coverage.sql がCIで検知する。テーブル・関数・トリガー・
-- 一意インデックス・RLS・ポリシーを足したら、このファイルにも書き足すこと。

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
    'bank_accounts', 'bank_operations', 'store_item_requests', 'task_reports',
    'families', 'guild_treasuries', 'economy_transactions',
    'placed_decorations', 'owned_items', 'equipped_items',
    'store_items', 'character_appearances', 'character_palettes', 'loans', 'loan_repayments',
    'economy_settings', 'economy_monthly_snapshots',
    'wallet_circulation_tracking', 'wallet_circulation_changes',
    'savings_settings', 'savings_accounts', 'savings_monthly_runs', 'savings_interest_months',
    'notifications', 'quest_streak_celebrations', 'app_open_days'
  ]) as t

  union all

  -- 1b. テーブル(privateスキーマ)
  -- アプリからは見えない、security definer 関数とトリガーだけが使うテーブル。
  select 'テーブル', 'private.' || t,
         case when to_regclass('private.' || t) is not null then 'OK' else '❌ 欠落' end
  from unnest(array[
    'pending_child_accounts'
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
    ('users', 'birth_date'),
    ('users', 'gender'),
    ('quests', 'family_id'),
    ('quest_logs', 'family_id'),
    ('store_item_requests', 'family_id'),
    ('task_reports', 'family_id'),
    ('store_items', 'family_id'),
    ('store_items', 'is_active'),
    ('store_items', 'updated_at'),
    ('quests', 'category'),
    ('quests', 'assigned_to'),
    ('quests', 'is_required'),
    ('notifications', 'dedupe_key'),
    ('transactions', 'quest_log_id'),
    ('bank_accounts', 'deposit_balance'),
    ('bank_accounts', 'loan_balance'),
    ('bank_accounts', 'interest_rate'),
    ('bank_accounts', 'loan_rate'),
    ('bank_accounts', 'loan_limit'),
    ('bank_accounts', 'loan_term_days'),
    ('economy_monthly_snapshots', 'avg_circulating_gol'),
    ('economy_monthly_snapshots', 'target_gol'),
    ('economy_transactions', 'store_base_price'),
    ('economy_transactions', 'store_price_index'),
    ('economy_transactions', 'store_sale_price'),
    ('character_appearances', 'accent_color'),
    ('character_appearances', 'hair_color'),
    ('character_appearances', 'skin_color')
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
    'create_bank_account_for_new_user', 'create_user_profile_for_auth_user',
    'current_user_family_id', 'create_family_with_treasury',
    'issue_treasury_gol', 'issue_treasury_hmc',
    'purchase_store_item', 'get_current_store_catalog', 'store_unlimited_stock',
    'approve_store_item_request', 'reject_store_item_request',
    'get_loan_offer', 'update_loan_settings', 'request_loan',
    'approve_loan', 'reject_loan', 'repay_loan',
    'get_or_create_monthly_price_index', 'get_economy_price_overview',
    'get_current_month_treasury_flow',
    'get_savings_summary', 'set_savings_amount', 'set_savings_day', 'withdraw_savings',
    'mark_notifications_read', 'prepare_child_account',
    'get_quest_streak', 'record_quest_streak_celebration', 'record_app_open'
  ]) as f

  union all

  -- 3b. 関数(privateスキーマ)
  -- issue_treasury_gol / create_family_with_treasury は内部で
  -- private.transfer_treasury_wallet を呼ぶ。private側が欠けていると
  -- public側の関数はOKでも実行時に落ちるため、個別に確認する。
  select '関数', 'private.' || f,
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname = f
         ) then 'OK' else '❌ 欠落' end
  from unnest(array[
    'safe_integer_max', 'transfer_treasury_wallet', 'protect_user_family_id',
    'sync_economy_snapshot_gol_columns',
    'set_quest_log_family_id',
    'submit_quest_completion_unchecked', 'approve_quest_log_unchecked',
    'reject_quest_log_unchecked',
    'purchase_store_item_with_treasury_unchecked',
    'bank_deposit_unchecked', 'bank_withdraw_unchecked',
    'bank_borrow_unchecked', 'bank_repay_unchecked', 'run_bank_operation',
    'approve_store_item_request_unchecked', 'reject_store_item_request_unchecked',
    'family_calendar_month', 'family_month_start', 'price_index_for', 'store_sale_price',
    'start_wallet_circulation_tracking', 'record_wallet_circulation_change', 'wallet_circulation_average',
    'savings_rate', 'savings_due_date', 'savings_principal', 'savings_average', 'lock_savings_family',
    'record_savings_movement', 'process_savings_family', 'run_savings_schedule',
    'is_quest_streak_milestone', 'quest_streak_for', 'app_open_streak_for',
    'notify', 'notify_family_role', 'notification_user_name', 'quest_streak_counting',
    'notify_quest_log_pending', 'notify_task_report_pending', 'notify_store_item_request_pending',
    'notify_quest_streak_milestone', 'notify_store_item_change',
    'birthday_in_year', 'nth_sunday', 'run_scheduled_notifications'
  ]) as f

  union all

  -- 4. トリガー
  select 'トリガー', c.name,
         case when exists (
           select 1 from pg_trigger
           where tgname = c.name and tgrelid = to_regclass(c.tbl)
             and tgfoid = to_regprocedure(c.fn) and not tgisinternal
             and tgenabled <> 'D'
         ) then 'OK' else '❌ 欠落' end
  from (values
    ('start_wallet_circulation_tracking_after_insert', 'public.families', 'private.start_wallet_circulation_tracking()'),
    ('record_wallet_circulation_change_after_write', 'public.users', 'private.record_wallet_circulation_change()'),
    -- 家族の操作をきっかけにお知らせを作る（#357 #358 #360 #361 #365 #366）
    ('notify_quest_log_pending_after_insert', 'public.quest_logs', 'private.notify_quest_log_pending()'),
    ('notify_task_report_pending_after_insert', 'public.task_reports', 'private.notify_task_report_pending()'),
    ('notify_store_item_request_pending_after_insert', 'public.store_item_requests', 'private.notify_store_item_request_pending()'),
    ('notify_quest_streak_milestone_after_update', 'public.quest_logs', 'private.notify_quest_streak_milestone()'),
    ('notify_store_item_change_after_write', 'public.store_items', 'private.notify_store_item_change()')
  ) as c(name, tbl, fn)

  union all

  select 'トリガー', 'create_bank_account_after_user_insert',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'create_bank_account_after_user_insert' and not tgisinternal
         ) then 'OK' else '❌ 欠落' end

  union all

  select 'トリガー', 'create_profile_after_auth_user_insert',
         case when exists (
           select 1
           from pg_catalog.pg_trigger t
           join pg_catalog.pg_class c on c.oid = t.tgrelid
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where t.tgname = 'create_profile_after_auth_user_insert'
             and n.nspname = 'auth'
             and c.relname = 'users'
             and not t.tgisinternal
         ) then 'OK' else '❌ 欠落' end

  union all

  select 'トリガー', 'protect_user_family_id_on_write',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'protect_user_family_id_on_write' and not tgisinternal
         ) then 'OK' else '❌ 欠落' end

  union all

  select 'トリガー', 'sync_economy_snapshot_gol_columns_before_write',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'sync_economy_snapshot_gol_columns_before_write'
             and tgrelid = 'public.economy_monthly_snapshots'::regclass
             and tgfoid = 'private.sync_economy_snapshot_gol_columns()'::regprocedure
             and not tgisinternal
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
    'bank_accounts_user_id_unique',
    'loans_one_pending_per_borrower',
    'economy_monthly_snapshots_family_id_snapshot_month_key',
    'quest_streak_celebrations_user_streak_milestone_key',
    'app_open_days_pkey',
    'notifications_user_dedupe_key_unique'
  ]) as i

  union all

  select 'トリガー', 'set_quest_log_family_id_before_insert',
         case when exists (
           select 1 from pg_trigger
           where tgname = 'set_quest_log_family_id_before_insert'
             and tgrelid = 'public.quest_logs'::regclass
             and tgfoid = 'private.set_quest_log_family_id()'::regprocedure
             and (tgtype & 2) <> 0
             and (tgtype & 4) <> 0
             and not tgisinternal
         ) then 'OK' else '❌ 欠落' end

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
        where n.nspname = 'public' and p.proname = fn and p.pronargs = 2 limit 1
      )) like '%insert into%transactions%'
        or lower((
          select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = fn and p.pronargs = 2 limit 1
        )) like ('%private.' || fn || '_unchecked%')
      then 'OK'
      else '❌ 古い版'
    end
  from unnest(array['bank_deposit', 'bank_withdraw', 'bank_repay']) as fn

  union all

  -- Issue #189: 銀行RPCの内部関数が、拒否理由を固有のSQLSTATEで返す版か。
  -- public側のラッパーだけを確認しても、private側へのマイグレーション適用漏れは
  -- 検知できないため、4関数それぞれの本体を確認する。
  select '関数の版', 'private.' || fn || ' が固有のSQLSTATEを返す版か',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = fn
          and not exists (
            select 1
            from unnest(codes) as required_code
            where p.prosrc not like '%' || required_code || '%'
          )
      ) then 'OK'
      else '❌ 古い版'
    end
  from (values
    ('bank_deposit_unchecked',  array['MHB01', 'MHB04', 'MHB05', 'MHB06']),
    ('bank_withdraw_unchecked', array['MHB02', 'MHB04', 'MHB05', 'MHB06']),
    ('bank_borrow_unchecked',   array['MHB04', 'MHB05', 'MHB06']),
    ('bank_repay_unchecked',    array['MHB01', 'MHB03', 'MHB04', 'MHB05', 'MHB06'])
  ) as bank_function(fn, codes)

  union all

  -- Issue #164: 更新前のアプリ向け3引数版は、決済せず更新案内を返すか。
  select '関数の版', 'purchase_store_item の旧3引数版が更新案内を返すか',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'purchase_store_item'
          and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_store_item_id uuid, p_idempotency_key text'
          and p.prosrc ilike '%アプリを更新してください%'
      ) then 'OK'
      else '❌ 欠落または古い版'
    end

  union all

  -- Issue #164: 一覧表示と購入処理が同じ物価連動価格を使う版か。
  select '関数の版', 'ストアの表示価格と決済額が同じ物価計算を使う版か',
    case
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'get_current_store_catalog'
          and p.prosrc ilike '%private.store_sale_price%'
      ) and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'purchase_store_item_with_treasury_unchecked'
          and p.prosrc ilike '%private.store_sale_price%'
          and p.prosrc ilike '%p_expected_sale_price%'
          and p.prosrc ilike '%表示後に価格が変わりました%'
          and p.prosrc ilike '%store_base_price%'
          and p.prosrc ilike '%store_price_index%'
          and p.prosrc ilike '%store_sale_price%'
      ) then 'OK'
      else '❌ 古い版'
    end

  union all

  select 'ポリシーの版', '親は非公開商品も確認でき、子どもは公開商品だけを確認できるか',
    case
      when exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'store_items'
          and policyname = 'store_items_select_family'
          and qual ilike '%is_active%'
          and qual ilike '%role%parent%'
      ) then 'OK'
      else '❌ 古い版'
    end

  union all

  -- Issue #311（PR #334 1R0Uさんレビュー指摘）: 承認時に画像URLを
  -- store_items へ引き継ぐ版か（store-item-imagesバケット配下のパスだけを引き継ぐ）。
  select '関数の版', 'private.approve_store_item_request_unchecked が画像URLを引き継ぐ版か',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'approve_store_item_request_unchecked'
          and p.prosrc like '%store-item-images%'
      ) then 'OK'
      else '❌ 古い版'
    end

  union all

  -- Issue #311（PR #334 1R0Uさんレビュー指摘）: 商品追加申請のINSERT時にも
  -- 画像URLのパス検証（store-item-imagesバケットの自分の家庭フォルダ配下）を
  -- 行う版か。ポリシー名自体は変わっていないため、存在確認だけでは古い版を
  -- 区別できない。
  select 'ポリシーの版', 'store_item_requests_insert_self がINSERT時にも画像URLを検証する版か',
    case
      when exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'store_item_requests'
          and policyname = 'store_item_requests_insert_self'
          and with_check like '%store-item-images%'
      ) then 'OK'
      else '❌ 古い版'
    end

  union all

  -- Issue #291: Google OAuth利用者をapp metadataで安全に判定する版か
  select '関数の版', 'create_user_profile_for_auth_user がGoogle OAuth対応版か',
    case
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'create_user_profile_for_auth_user'
          and lower(p.prosrc) like '%raw_app_meta_data%provider%google%'
          and lower(p.prosrc) like '%raw_user_meta_data%full_name%'
          and lower(p.prosrc) like '%left%50%'
          and lower(p.prosrc) like '%split_part%new.email%''@''%'
      )
      then 'OK'
      else '❌ 古い版'
    end

  union all

  -- Issue #264: 親が予約した子供アカウントを、予約した家族の子供として作る版か
  select '関数の版', 'create_user_profile_for_auth_user が子供アカウント対応版か',
    case
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'create_user_profile_for_auth_user'
          and lower(p.prosrc) like '%private.pending_child_accounts%lower(new.email)%'
          and lower(p.prosrc) like '%''child''%v_pending.family_id%'
      )
      then 'OK'
      else '❌ 古い版'
    end

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

  select '制約の版', 'ストア購入の価格履歴が実売額と一致する制約があるか',
    case
      when exists (
        select 1
        from pg_constraint
        where connamespace = 'public'::regnamespace
          and conname = 'economy_transactions_store_price_history_valid'
          and convalidated
          and pg_get_constraintdef(oid) ilike '%store_sale_price%amount%'
      ) then 'OK'
      else '❌ 制約がない'
    end

  union all

  -- 8. 承認処理がギルド金庫から報酬を支払う版か(20260924000000 の修正)
  select '関数の版', 'approve_quest_log がギルド金庫から支払う版か',
    case
      when not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'approve_quest_log'
      ) then '❌ 関数がない'
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'approve_quest_log_unchecked'
          and lower(p.prosrc) like '%private.transfer_treasury_wallet(%'
      )
      then 'OK'
      else '❌ 古い版'
    end

  union all

  select '関数の版', 'public/privateの関数にHMC文言が残っていない',
    case
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private')
          and p.prosrc like '%HMC%'
      ) then '❌ 古い版'
      else 'OK'
    end

  union all

  select '関数の版', '追加発行の正式RPCがgolで旧RPCが互換ラッパーか',
    case
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'issue_treasury_gol'
          and p.prosrc not ilike '%hmc%'
      ) and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'issue_treasury_hmc'
          and p.prosrc ilike '%issue_treasury_gol%'
          and not p.prosecdef
      ) then 'OK'
      else '❌ 古い版'
    end

  union all

  select '関数の版', '物価指数RPCがgol列を使う版か',
    case
      when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'get_or_create_monthly_price_index'
          and p.prosrc ilike '%avg_circulating_gol%'
          and p.prosrc ilike '%target_gol%'
          and p.prosrc not ilike '%avg_circulating_hmc%'
          and p.prosrc not ilike '%target_hmc%'
      ) then 'OK'
      else '❌ 古い版'
    end

  union all

  select '関数の版', '物価指数が前月のWallet平均を使う版か',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_or_create_monthly_price_index'
        and p.prosrc like '%private.wallet_circulation_average(v_family_id, v_previous_month)%'
        and p.prosrc like '%circulating_history_complete%'
        and strpos(p.prosrc, 'if found then return v_existing; end if;') > 0
        and strpos(p.prosrc, 'if found then return v_existing; end if;')
          < strpos(p.prosrc, 'for no key update;')
        and p.prosrc not ilike '%sum(users.balance)%'
    ) then 'OK' else '❌ 古い版' end

  union all

  select '関数の版', 'ストア購入がユーザーと金庫を物価取得前にロックする版か',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'purchase_store_item_with_treasury_unchecked'
        and p.prosrc like '%perform 1 from public.users where id = p_user_id for update;%'
        and p.prosrc like '%perform 1 from public.guild_treasuries where family_id = v_family_id for update;%'
    ) then 'OK' else '❌ 古い版' end

  union all

  -- Issue #190: ID付き経路の存在と権限、IDなし経路の閉鎖も確認する。
  select '関数の版', fn || ' が操作ID付きの経路か',
    case when exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn and p.pronargs = 3
        and p.prosrc like '%private.run_bank_operation%'
        and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'EXECUTE') = (fn in ('bank_deposit', 'bank_withdraw'))
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
    ) and not has_function_privilege('authenticated', 'public.' || fn || '(uuid,numeric)', 'EXECUTE')
    then 'OK' else '❌ 古い版または権限不一致' end
  from unnest(array['bank_deposit', 'bank_withdraw', 'bank_borrow', 'bank_repay']) as fn

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
  from unnest(array[
    'users', 'families', 'guild_treasuries', 'economy_transactions',
    'quests', 'quest_logs', 'transactions', 'bank_accounts',
    'store_item_requests', 'task_reports', 'store_items',
    'placed_decorations', 'owned_items', 'equipped_items',
    'character_appearances', 'character_palettes', 'loans', 'loan_repayments',
    'economy_settings', 'economy_monthly_snapshots',
    'wallet_circulation_tracking', 'wallet_circulation_changes',
    'savings_settings', 'savings_accounts', 'savings_monthly_runs', 'savings_interest_months', 'bank_operations',
    'notifications', 'quest_streak_celebrations', 'app_open_days'
  ]) as t

  union all

  -- 10. ポリシーがあるか
  select 'ポリシー', p,
         case when exists (
           select 1 from pg_policies where schemaname = 'public' and policyname = p
         ) then 'OK' else '❌ 欠落' end
  from unnest(array[
    'users_select_family', 'users_update_self',
    'families_select_own', 'guild_treasuries_select_own', 'economy_transactions_select_own',
    'quests_select_family', 'quests_insert_parent', 'quests_accept_open',
    'quest_logs_select_family', 'transactions_select_self', 'bank_accounts_select_self',
    'store_item_requests_select_family', 'store_item_requests_insert_self',
    'task_reports_select_family', 'task_reports_insert_self',
    'store_items_select_family', 'store_items_insert_parent',
    'placed_decorations_select_self', 'placed_decorations_insert_self',
    'placed_decorations_update_self', 'placed_decorations_delete_self',
    'owned_items_select_self', 'equipped_items_select_self',
    'equipped_items_insert_self', 'equipped_items_update_self', 'equipped_items_delete_self',
    'character_appearances_select_self', 'character_appearances_insert_self',
    'character_appearances_update_self',
    'character_palettes_select_self', 'character_palettes_insert_self',
    'character_palettes_update_self',
    'loans_select_own_or_parent', 'loan_repayments_select_own_or_parent',
    'notifications_select_self', 'quest_streak_celebrations_select_self',
    'app_open_days_select_self'
  ]) as p

  union all

  -- 11. Storageバケット（Issue #311）
  select 'ストレージ', 'store-item-images（バケット）',
         case when exists (
           select 1 from storage.buckets where id = 'store-item-images'
         ) then 'OK' else '❌ 欠落' end

  union all

  -- 12. Storageポリシー（Issue #311）
  -- storage.objects はSupabaseが管理する共有テーブルのため、他のテーブルと違い
  -- schemaname = 'public' ではなく 'storage' で確認する。
  select 'ストレージ', 'store_item_images_insert_own_family（ポリシー）',
         case when exists (
           select 1 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'store_item_images_insert_own_family'
         ) then 'OK' else '❌ 欠落' end

  union all

  -- 20261003000100で作ったDELETEポリシーは20261004000100で作り直したため、
  -- 古い名前のポリシーがいないこと自体は確認しない（名前が変わっている）。
  select 'ストレージ', 'store_item_images_select_own_upload（ポリシー）',
         case when exists (
           select 1 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'store_item_images_select_own_upload'
         ) then 'OK' else '❌ 欠落' end

  union all

  select 'ストレージ', 'store_item_images_delete_own_upload（ポリシー）',
         case when exists (
           select 1 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'store_item_images_delete_own_upload'
         ) then 'OK' else '❌ 欠落' end

  union all

  -- 13. bank_accounts.user_id に重複がないか(一意インデックス作成の前提)
  select 'データ整合性', 'bank_accounts.user_id に重複がない',
         pg_temp.check_bank_accounts_duplicates()

  union all

  select 'データ整合性', '物価指数スナップショットのgol列と互換列が一致する',
         case when exists (
           select 1 from public.economy_monthly_snapshots
           where avg_circulating_gol is null
              or target_gol is null
              or avg_circulating_gol is distinct from avg_circulating_hmc
              or target_gol is distinct from target_hmc
         ) then '❌ 不一致' else 'OK' end
) x
order by
  case 種別
    when 'テーブル' then 1 when '列' then 2 when '関数' then 3
    when 'トリガー' then 4 when 'インデックス' then 5
    when '関数の版' then 6 when '制約の版' then 7
    when 'RLS' then 8 when 'ポリシー' then 9
    when 'ストレージ' then 10 when 'データ整合性' then 11 else 12 end,
  対象;
