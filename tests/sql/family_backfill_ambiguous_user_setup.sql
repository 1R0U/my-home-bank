-- 固定ゲスト以外にも、Authを持たない所属不明の旧利用者がいる状態を再現する。
insert into public.users (id, name, role, balance)
values ('20800000-0000-4000-8000-000000000203', '所属不明の旧利用者', 'child', 0);
