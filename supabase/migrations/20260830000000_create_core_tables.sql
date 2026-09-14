-- Issue #182: users / quests / quest_logs を作るマイグレーションを追加する ------------
--
-- 【背景】
-- これら3テーブルは開発初期にSupabaseの管理画面（Table Editor）で作られており、
-- マイグレーションファイルが存在しなかった。そのため、空のSupabaseプロジェクトへ
-- supabase/migrations/ を順に適用しても、20260831000000_create_transactions.sql の
-- 外部キー制約（references public.users / public.quest_logs）で失敗していた。
--
-- 【このファイルの位置づけ】
-- 既存環境向けの変更ではなく、新規環境で同じ構造を再現するための「追いつき用」。
-- create table if not exists のため、既存環境では何も起きない。
-- 20260903000000_create_bank_accounts.sql が取っている手法と同じ。
--
-- 【重要な注意】
-- 以下の列定義は types/index.ts と、既存マイグレーションでの使われ方から復元した
-- ものであり、稼働中のSupabaseプロジェクトとの照合は行っていない。
-- 実DBと差異がある場合は、このファイルを実DB側に合わせて修正すること
-- （実DBをこのファイルに合わせて変更するのではない）。
-- 末尾の検証ブロックが、既存環境への適用時に列の欠落を検出する。
--
-- 【後続のマイグレーションが追加する列は、ここでは作らない】
-- quests.category と quests.assigned_to、および quests.status の CHECK 制約は
-- 20260831010000_connect_tasks.sql が追加・設定する。二重に定義せず、
-- このファイルでは「その変更が適用される前の状態」を作る。

-- 1. 利用者 -----------------------------------------------------------------
-- 復元元: types/index.ts の User 型
-- id が uuid であることは 20260831000000_create_transactions.sql のコメントで確認済み。
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('parent', 'child')),
  -- balance: お財布残高。transactions.amount が integer であること、および
  -- アプリが正の整数のみを受け付けることに合わせて integer とした。
  -- 実DBが numeric の可能性があるため、末尾の検証ブロックで型も報告する。
  balance integer not null default 0,
  created_at timestamptz not null default now()
);

-- 2. クエスト ---------------------------------------------------------------
-- 復元元: types/index.ts の Quest 型から、後続マイグレーションが追加する
-- category / assigned_to を除いたもの。
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  -- reward_amount: approve_quest_log が q.reward_amount::integer と明示的に
  -- キャストしているため、実DBでは numeric の可能性がある。要確認。
  reward_amount integer not null,
  -- status の CHECK 制約は 20260831010000_connect_tasks.sql が
  -- drop constraint if exists → add constraint で張り直すため、ここでは付けない。
  -- 元の制約が取っていた値を推測しないための措置。
  status text not null default 'open',
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 3. クエストの完了申請 -------------------------------------------------------
-- 復元元: types/index.ts の QuestLog 型。
-- submit_quest_completion が insert into quest_logs (quest_id, user_id) のみで
-- 成功することから、他の列には既定値があると判断した。
-- status の既定値が 'pending' であることは、approve_quest_log が
-- status = 'pending' の行を対象にすることと整合する。
create table if not exists public.quest_logs (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  completed_at timestamptz not null default now(),
  approved_by uuid references public.users (id),
  approved_at timestamptz
);

-- 承認待ち一覧の取得を想定したインデックス。
-- task_reports の task_reports_status_idx と同じ考え方。
create index if not exists quest_logs_status_idx on public.quest_logs (status);

-- 4. 構造のずれを検出する ------------------------------------------------------
-- create table if not exists は、既存テーブルがこのファイルと違う構造でも
-- 何も言わずに素通りする。その場合ずれが隠れたままになるため、
-- 期待する列が存在するかを確認し、欠けていれば適用を止める。
do $$
declare
  v_missing text[];
  v_expected constant text[][] := array[
    ['users', 'id'], ['users', 'name'], ['users', 'role'],
    ['users', 'balance'], ['users', 'created_at'],
    ['quests', 'id'], ['quests', 'title'], ['quests', 'description'],
    ['quests', 'reward_amount'], ['quests', 'status'],
    ['quests', 'created_by'], ['quests', 'created_at'],
    ['quest_logs', 'id'], ['quest_logs', 'quest_id'], ['quest_logs', 'user_id'],
    ['quest_logs', 'status'], ['quest_logs', 'completed_at'],
    ['quest_logs', 'approved_by'], ['quest_logs', 'approved_at']
  ];
  v_row text[];
  v_type text;
begin
  v_missing := array[]::text[];

  foreach v_row slice 1 in array v_expected loop
    select data_type
    into v_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_row[1]
      and column_name = v_row[2];

    if v_type is null then
      v_missing := v_missing || format('%s.%s', v_row[1], v_row[2]);
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception using
      message = format(
        'このマイグレーションが前提とする列が%s件見つかりません', array_length(v_missing, 1)
      ),
      detail = format('欠けている列: %s', array_to_string(v_missing, ', ')),
      hint = '実DBの構造を確認し、20260830000000_create_core_tables.sql を実DB側に合わせて修正してください';
  end if;
end;
$$;

-- 5. 型の差異を報告する（適用は止めない）---------------------------------------
-- 列の型は復元の確度が最も低い部分のため、差異があれば NOTICE として出す。
-- 型が違っても既存環境は正常に動いているため、ここでは適用を止めない。
-- 出力された場合は、このファイルを実DBに合わせて修正すること。
do $$
declare
  v_row record;
  v_expected constant text[][] := array[
    ['users', 'balance', 'integer'],
    ['quests', 'reward_amount', 'integer'],
    ['users', 'id', 'uuid'],
    ['quest_logs', 'quest_id', 'uuid']
  ];
  v_item text[];
begin
  foreach v_item slice 1 in array v_expected loop
    select data_type
    into v_row
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_item[1]
      and column_name = v_item[2];

    if found and v_row.data_type is distinct from v_item[3] then
      raise notice
        '型が想定と異なります: %.% は想定 % に対して実際は % です。20260830000000_create_core_tables.sql を実DBに合わせて修正してください',
        v_item[1], v_item[2], v_item[3], v_row.data_type;
    end if;
  end loop;
end;
$$;

-- 注意（既知の制約・Phase 2で対応予定、Issue #63/#64/#75と同様）:
-- これら3テーブルにも RLS（Row Level Security）ポリシーは設定していない。
-- 現状はモックログインで実セッションがなく auth.uid() が使えないため、
-- 既存テーブルと同じ扱いとする。Supabase Auth 導入時にまとめて対応する。
