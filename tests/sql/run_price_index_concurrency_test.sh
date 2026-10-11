#!/usr/bin/env bash
set -euo pipefail
: "${PGURL:?PGURLを指定してください}"

# 保存済み指数の取得は、他の処理が家庭ロックを保持していても完了する。
# 未作成時はロックを待ち、先行処理が保存した指数を再確認して返す。
first_pid=""
second_pid=""
cleanup() {
  local status=$?
  trap - EXIT
  for pid in "$first_pid" "$second_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/treasury_payments_concurrency_cleanup.sql || status=1
  exit "$status"
}
trap cleanup EXIT

wait_for_event() {
  local app_name=$1
  local event=$2
  for _ in {1..50}; do
    if [[ "$(psql "$PGURL" -Atq -c "select exists(select 1 from pg_stat_activity where application_name = '$app_name' and (wait_event = '$event' or wait_event_type = '$event'))")" == "t" ]]; then
      return
    fi
    sleep 0.05
  done
  echo "$app_name の $event 待機を確認できませんでした" >&2
  exit 1
}

auth_options='-c request.jwt.claim.sub=c0000000-0000-4000-8000-000000000012'
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/treasury_payments_concurrency_setup.sql
PGOPTIONS="$auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -q -c 'select public.get_or_create_monthly_price_index()'

PGAPPNAME='price-index-holder' PGOPTIONS='-c statement_timeout=15s' \
psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select 1 from public.families where id = 'c0000000-0000-4000-8000-000000000001' for no key update;
select pg_sleep(4);
commit;
SQL
first_pid=$!
wait_for_event 'price-index-holder' 'PgSleep'
# 家庭ロックが必要な旧実装ではタイムアウトする。
PGOPTIONS="-c statement_timeout=1s $auth_options" \
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c 'select public.get_or_create_monthly_price_index()'
wait "$first_pid"

psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "delete from public.economy_monthly_snapshots where family_id = 'c0000000-0000-4000-8000-000000000001'"
PGAPPNAME='price-index-creator' PGOPTIONS="-c statement_timeout=15s $auth_options" \
psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select public.get_or_create_monthly_price_index();
-- 後続処理が再計算した場合を判別できるよう、保存済みの値に変更する。
update public.economy_monthly_snapshots set price_index = 110
where family_id = 'c0000000-0000-4000-8000-000000000001';
select pg_sleep(4);
commit;
SQL
first_pid=$!
wait_for_event 'price-index-creator' 'PgSleep'

PGAPPNAME='price-index-reader' PGOPTIONS="-c statement_timeout=15s $auth_options" \
psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL' &
do $$
declare
  v_snapshot public.economy_monthly_snapshots%rowtype;
begin
  v_snapshot := public.get_or_create_monthly_price_index();
  if v_snapshot.price_index <> 110 then
    raise exception '先行処理が確定した指数を再計算しています';
  end if;
end;
$$;
SQL
second_pid=$!
wait_for_event 'price-index-reader' 'Lock'
wait "$first_pid"
wait "$second_pid"

psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
begin
  if (select count(*) from public.economy_monthly_snapshots
      where family_id = 'c0000000-0000-4000-8000-000000000001') <> 1 then
    raise exception '並行呼び出しで月次指数が重複しています';
  end if;
end;
$$;
SQL
