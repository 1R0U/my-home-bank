-- すでに家庭がある一方、Authを持たない旧ゲスト利用者はfamily_id未設定の状態を再現する。
insert into public.families (id, name)
values ('20800000-0000-4000-8000-000000000202', '既存家庭');
