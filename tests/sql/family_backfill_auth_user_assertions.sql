-- Auth利用者は初回ログイン時に自分の家庭を作るため、既存家庭へ推測補完しない。
do $$
begin
  if not exists (
    select 1
    from public.users
    where id = '20800000-0000-4000-8000-000000000201'
      and family_id is null
  ) then
    raise exception 'Auth利用者のfamily_idがバックフィルで変更されました';
  end if;
end;
$$;
