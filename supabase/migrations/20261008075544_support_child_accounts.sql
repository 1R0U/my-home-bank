-- Issue #264: 親が自分の家族へ子供アカウントを追加できるようにする（1/3） -----------
--
-- 子供はメールもパスワードも持たない。Authアカウントは親の操作で Edge Function
-- （supabase/functions/create-child-account）が管理者権限で作る。
-- メールは内部用のダミーで誰にも見せず、パスワードは付けない。
--
-- 流れ:
--   1. 親が prepare_child_account(名前) を呼ぶ（Edge Functionが親のJWTのまま呼ぶ）。
--      呼び出し元が「家族のある親」かをここで確かめ、子供の予約を
--      private.pending_child_accounts に書き、内部用のメールアドレスを返す。
--   2. Edge Function がそのメールで auth.users を作る。
--   3. auth.users の登録トリガー（create_user_profile_for_auth_user）が予約を見つけ、
--      同じトランザクションで role = 'child' と family_id を入れた users 行を作る。
--
-- 子供であることと家族は、予約（親の認可を通った後にだけ書かれる）から決める。
-- raw_user_meta_data は利用者自身が変更できるため使わない（#291 と同じ考え方）。
-- 予約はメールアドレスで引く。アドレスはランダムで、発行した親の Edge Function 呼び出しに
-- しか返らないため、他人が同じアドレスで公開登録して予約を横取りすることはできない。
--
-- 予約を app_metadata ではなくテーブルで渡すのは、Supabase Auth が管理者作成時の
-- app_metadata を auth.users の INSERT 時点で入れているかを保証していないため。
-- email は INSERT 時点で必ず入っている。

create table private.pending_child_accounts (
  email text primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  created_by uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pending_child_accounts_email_lower check (email = lower(email)),
  constraint pending_child_accounts_name_length check (char_length(name) between 1 and 50)
);

-- アプリからは読み書きさせない。security definer 関数とトリガーだけが触る。
revoke all on table private.pending_child_accounts from public, anon, authenticated;

create or replace function public.prepare_child_account(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_role text;
  v_family_id uuid;
  v_name text := btrim(p_name);
  v_email text;
begin
  if v_actor_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  select role, family_id
  into v_role, v_family_id
  from public.users
  where id = v_actor_user_id;

  if not found or v_role is distinct from 'parent' then
    raise exception '子供アカウントを追加できるのは親だけです';
  end if;
  if v_family_id is null then
    raise exception '先に家族を作成してください';
  end if;
  if v_name is null or v_name = '' or char_length(v_name) > 50 then
    raise exception '名前は1〜50文字で入力してください';
  end if;

  -- 作成に失敗して使われなかった予約を片付ける
  delete from private.pending_child_accounts where expires_at <= now();

  -- 実在しないドメイン（.invalid はRFC 2606で予約済み）にして、メールが外へ出ないようにする
  v_email := 'child-' || replace(gen_random_uuid()::text, '-', '') || '@children.my-home-bank.invalid';

  insert into private.pending_child_accounts (email, family_id, name, created_by, expires_at)
  values (v_email, v_family_id, v_name, v_actor_user_id, now() + interval '10 minutes');

  return v_email;
end;
$$;

revoke all on function public.prepare_child_account(text) from public, anon;
grant execute on function public.prepare_child_account(text) to authenticated;

-- 20260925010000 の版に、子供の予約を見る分岐を先頭へ足したもの。
-- 予約がなければ、これまでどおりメール登録・Google登録の親として扱う。
create or replace function public.create_user_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := new.raw_app_meta_data ->> 'provider';
  v_is_google boolean := v_provider = 'google';
  v_pending private.pending_child_accounts%rowtype;
  v_name text;
  v_role text;
begin
  -- Issue #264: 親が予約した子供アカウント
  select *
  into v_pending
  from private.pending_child_accounts
  where email = lower(new.email)
    and expires_at > now()
  for update;

  if found then
    delete from private.pending_child_accounts where email = v_pending.email;

    -- family_id を入れて作れるのは、このトリガーが家族作成RPCと同じ所有者で動くため
    -- （private.protect_user_family_id）。
    insert into public.users (id, name, role, balance, family_id)
    values (new.id, v_pending.name, 'child', 0, v_pending.family_id);

    return new;
  end if;

  if v_is_google then
    v_name := btrim(left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(split_part(new.email, '@', 1)), '')
      ),
      50
    ));
    v_role := 'parent';
  else
    v_name := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');
    v_role := new.raw_user_meta_data ->> 'role';
  end if;

  if v_name is null or char_length(v_name) > 50 then
    raise exception '名前を入力してください';
  end if;

  if v_role is distinct from 'parent' then
    raise exception '公開登録で指定できる役割はparentだけです';
  end if;

  insert into public.users (id, name, role, balance)
  values (new.id, v_name, v_role, 0);

  return new;
end;
$$;

-- クライアントから直接呼ぶ関数ではない。auth.usersのトリガーだけが実行する。
revoke all on function public.create_user_profile_for_auth_user() from public, anon, authenticated;
