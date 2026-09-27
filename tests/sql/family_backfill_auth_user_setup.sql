-- family_id未設定のAuth利用者を、家庭バックフィルの直前状態へ用意する。
insert into auth.users (id, raw_user_meta_data)
values (
  '20800000-0000-4000-8000-000000000201',
  '{"name":"家庭作成前のAuth親","role":"parent"}'::jsonb
);
