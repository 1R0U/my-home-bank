-- Issue #75: 設定内容をSupabaseに保存する ------------------------------------

-- users.notifications_enabled 列を追加（設定画面の通知トグルを保存するため）
alter table users
  add column if not exists notifications_enabled boolean not null default true;
