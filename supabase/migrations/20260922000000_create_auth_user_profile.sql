-- Issue #24: Supabase Authの登録とusersプロフィール作成を原子的に行う ---------
--
-- クライアントで auth.signUp() の後に users へ insert すると、後半だけ失敗した場合に
-- Authアカウントだけが残る。auth.users の AFTER INSERT トリガーでプロフィールを作り、
-- どちらかが失敗したらAuth側の登録も同じトランザクションで取り消されるようにする。
--
-- 公開登録は「新しい家族を作る親」専用で、raw_user_meta_data の name と
-- role = 'parent' を必須とする。Supabase Dashboardからの作成・招待や将来のOAuthも
-- この条件を満たさなければ Database error saving new user で失敗するため、別経路を
-- 追加するときはメタデータを設定するか、用途別のプロフィール作成方式へ変更すること。

create or replace function public.create_user_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(new.raw_user_meta_data ->> 'name');
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  if v_name is null or v_name = '' or char_length(v_name) > 50 then
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

drop trigger if exists create_profile_after_auth_user_insert on auth.users;
create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row
execute function public.create_user_profile_for_auth_user();

-- Authを通さないプロフィール作成と、他人のrole・balanceの読み書きを遮断する。
alter table public.users enable row level security;

drop policy if exists users_select_self on public.users;
drop policy if exists users_select_family on public.users;
create policy users_select_family
on public.users
for select
to authenticated
using (
  auth.uid() = id
  or family_id = public.current_user_family_id()
);

drop policy if exists users_update_self on public.users;
create policy users_update_self
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

revoke all on table public.users from anon;
revoke insert, delete, update on table public.users from authenticated;
grant select on table public.users to authenticated;
grant update (name, notifications_enabled) on table public.users to authenticated;
