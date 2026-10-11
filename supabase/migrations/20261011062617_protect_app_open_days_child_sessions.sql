-- Issue #264: 最新mainで追加された開いた日の記録も、失効した子供JWTから保護する。
-- 適用済みのコードログインSQLと、mainのテーブル作成SQLは変更しない。
create policy app_open_days_active_child_session on public.app_open_days
  as restrictive for all to authenticated
  using ((select public.current_child_session_is_valid()))
  with check ((select public.current_child_session_is_valid()));
