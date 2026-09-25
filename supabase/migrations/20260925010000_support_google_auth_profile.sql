-- Issue #291: Google OAuth利用者のプロフィールをAuth登録と同時に作成する -------
--
-- raw_user_meta_data は利用者自身が更新できるため、認証方式やroleの判定には使わない。
-- Supabase Authが管理する raw_app_meta_data.provider でGoogle登録を判定し、Google経由の
-- 新規利用者だけを親として扱う。表示名は認可情報ではないため、Googleが同期した
-- raw_user_meta_data の name / full_name をプロフィール名として利用する。
--
-- メール登録は従来どおり、クライアントが送る name と role = 'parent' を必須とする。

create or replace function public.create_user_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := new.raw_app_meta_data ->> 'provider';
  v_is_google boolean := v_provider = 'google';
  v_name text;
  v_role text;
begin
  if v_is_google then
    v_name := coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
    );
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
