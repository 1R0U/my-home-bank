-- Issue #24: Supabase Authの登録とusersプロフィール作成を原子的に行う ---------
--
-- クライアントで auth.signUp() の後に users へ insert すると、後半だけ失敗した場合に
-- Authアカウントだけが残る。auth.users の AFTER INSERT トリガーでプロフィールを作り、
-- どちらかが失敗したらAuth側の登録も同じトランザクションで取り消されるようにする。

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
  if v_name is null or v_name = '' then
    raise exception '名前を入力してください';
  end if;

  if v_role is null or v_role not in ('parent', 'child') then
    raise exception '役割はparentまたはchildで指定してください';
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
