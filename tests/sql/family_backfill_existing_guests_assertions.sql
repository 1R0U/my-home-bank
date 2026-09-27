-- 固定ゲストは実家庭へ混ぜず、専用の既存家庭へ隔離して補完する。
do $$
begin
  if (
    select count(*)
    from public.users
    where id in (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002'
    )
      and family_id = '00000000-0000-4000-8000-000000000208'
  ) <> 2 then
    raise exception '固定ゲストが専用家庭へ補完されていません';
  end if;

  if not exists (
    select 1 from public.families
    where id = '20800000-0000-4000-8000-000000000202'
  ) then
    raise exception '既存の実家庭が失われました';
  end if;
end;
$$;
