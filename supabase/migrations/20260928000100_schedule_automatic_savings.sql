-- Supabaseではpg_cronを有効化し、アプリを閉じていても毎時処理する。
-- 拡張が配布されない素のPostgreSQL（CI）は処理本体だけを検証する。
do $schedule$
begin
  if exists(select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('automatic-savings-hourly', '0 * * * *', 'select private.run_savings_schedule();');
  else
    raise notice 'pg_cronがありません。自動積立の定期実行にはpg_cron対応環境が必要です';
  end if;
end;
$schedule$;
