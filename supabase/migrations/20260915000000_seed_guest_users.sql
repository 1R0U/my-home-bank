-- Issue #211: 開発用のゲストユーザーを seed する --------------------------------
--
-- 【背景】
-- 開発中にアプリへ入る経路が、モックユーザー（start:parent / クイックログイン）と
-- 開発用ナビ（createUserProfile で毎回 users に insert）に分かれていた。
-- 前者は users.id が "user-parent-1" という非UUIDのため実DBを一切触れず、
-- 後者は押すたびに users の行が増え、毎回「別人」になるため
-- 「子供が申請 → 大人が承認」のような通しの確認ができなかった。
--
-- 【このファイルの位置づけ】
-- 固定のUUIDを持つゲストユーザーを大人・子供の2人だけ作る。
-- `npm run start:parent` / `start:child` はこのゲストとしてログイン済みで起動する。
-- IDが固定なので、
--   - 起動のたびに行が増えない
--   - 前回作ったクエストや取引履歴が次回も残っている
--   - 大人ゲストと子供ゲストが常に両方存在するので、承認フローを通しで確認できる
--
-- 【2人に分けている理由】
-- role は users 行の列なので、1行を使い回すと大人/子供の切り替えのたびに
-- update users set role が必要になり、その人が作った quests.created_by や
-- quest_logs.user_id の意味が毎回ひっくり返る。
--
-- 【本番環境にも入ることについて】
-- seed 専用の仕組みがなく、supabase/migrations/ は全環境に適用される。
-- 名前を「ゲスト（大人）」のように人間から見て分かるものにして、当面は割り切る。
-- 本番から外したくなったら、別のマイグレーションで削除する
--   （ただし quests.created_by などから参照されていると削除できない点に注意）。
--
-- 【再適用について】
-- on conflict (id) do nothing のため、2回目以降は何も起きない。
-- 既に開発で残高やクエストを動かしていても、その状態は上書きされない。

-- 1. ゲストユーザー ------------------------------------------------------------
-- UUIDはアプリ側の定数（lib/guestUsers.ts）と一致させること。片方だけ変えると、
-- 起動時に「存在しないユーザー」としてログインした状態になり、取得が全て空になる。
insert into public.users (id, name, role, balance) values
  ('00000000-0000-4000-8000-000000000001', 'ゲスト（大人）', 'parent', 1000),
  ('00000000-0000-4000-8000-000000000002', 'ゲスト（子供）', 'child', 500)
on conflict (id) do nothing;

-- 2. ゲストの銀行口座 ----------------------------------------------------------
-- 通常は 20260903000000_create_bank_accounts.sql が作るトリガ
-- （create_bank_account_after_user_insert）が、利用者の追加に合わせて口座を作る。
-- ここで明示的にも入れているのは保険。**口座の行がないと、預入/引き出しRPCの
-- update が0行に当たり、お財布だけ減って預金が増えない**（RPC側は行の有無を見ていない）。
-- トリガが無い環境にこのファイルが適用されても、そうならないようにしておく。
-- トリガが動いていれば not exists に引っかかって何もしない。
insert into public.bank_accounts (user_id, deposit_balance, loan_balance)
select u.id, 0, 0
from public.users u
where u.id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
)
  and not exists (
    select 1 from public.bank_accounts b where b.user_id = u.id
  );

-- 3. 入ったことを確認する ------------------------------------------------------
-- 上の insert が何らかの理由で通らなかった場合、アプリ側は「存在しないユーザーで
-- ログイン済み」になり、原因の分かりにくい空画面になる。ここで止める。
do $$
declare
  v_missing text[];
begin
  select array_agg(expected.id::text)
  into v_missing
  from (
    values
      ('00000000-0000-4000-8000-000000000001'::uuid),
      ('00000000-0000-4000-8000-000000000002'::uuid)
  ) as expected (id)
  where not exists (select 1 from public.users u where u.id = expected.id);

  if v_missing is not null then
    raise exception '開発用ゲストユーザーが作成されていません: %', array_to_string(v_missing, ', ');
  end if;
end $$;
