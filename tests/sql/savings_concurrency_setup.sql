insert into public.families(id,name) values('e162cccc-0000-4000-8000-000000000001','積立並行検証');
insert into public.users(id,family_id,name,role,balance) values
 ('e162cccc-0000-4000-8000-000000000012','e162cccc-0000-4000-8000-000000000001','子','child',1000);
insert into public.guild_treasuries(family_id,balance,initial_supply,total_supply)
 values('e162cccc-0000-4000-8000-000000000001',9000,10000,10000);
insert into public.savings_settings(family_id,transfer_day)
 values('e162cccc-0000-4000-8000-000000000001',1);
insert into public.savings_accounts(user_id,family_id,monthly_amount,next_transfer_month)
 values('e162cccc-0000-4000-8000-000000000012','e162cccc-0000-4000-8000-000000000001',100,private.family_calendar_month(now()));
