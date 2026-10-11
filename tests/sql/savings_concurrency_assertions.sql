do $$
begin
  if (select balance from public.savings_accounts where user_id='e162cccc-0000-4000-8000-000000000012') <> 60
    or (select balance from public.users where id='e162cccc-0000-4000-8000-000000000012') <> 940
    or (select count(*) from public.economy_transactions where family_id='e162cccc-0000-4000-8000-000000000001') <> 2 then
    raise exception '並行実行で積立・引き出しが重複しました';
  end if;
end;
$$;
-- 検証用の固定IDだけを片付ける。
delete from public.savings_monthly_runs where family_id='e162cccc-0000-4000-8000-000000000001';
delete from public.savings_interest_months where family_id='e162cccc-0000-4000-8000-000000000001';
delete from public.savings_accounts where family_id='e162cccc-0000-4000-8000-000000000001';
delete from public.savings_settings where family_id='e162cccc-0000-4000-8000-000000000001';
delete from public.economy_transactions where family_id='e162cccc-0000-4000-8000-000000000001';
delete from public.transactions where user_id='e162cccc-0000-4000-8000-000000000012';
delete from public.users where id='e162cccc-0000-4000-8000-000000000012';
delete from public.guild_treasuries where family_id='e162cccc-0000-4000-8000-000000000001';
delete from public.families where id='e162cccc-0000-4000-8000-000000000001';
