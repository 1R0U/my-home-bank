#!/usr/bin/env bash
set -euo pipefail
: "${PGURL:?PGURLを指定してください}"
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/savings_concurrency_setup.sql
first_pid=""
cleanup() {
  if [[ -n "$first_pid" ]] && kill -0 "$first_pid" 2>/dev/null; then
    kill "$first_pid" 2>/dev/null || true
    wait "$first_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
operation="select set_config('request.jwt.claim.sub','e162cccc-0000-4000-8000-000000000012',true);
select private.process_savings_family('e162cccc-0000-4000-8000-000000000001',now());
select public.withdraw_savings(40,'parallel-retry');"
PGAPPNAME=savings-concurrency-first psql "$PGURL" -v ON_ERROR_STOP=1 -q \
  -c "begin; $operation select pg_sleep(5); commit;" &
first_pid=$!
waiting=false
for _ in {1..40}; do
  if [[ "$(psql "$PGURL" -Atq -c "select exists(select 1 from pg_stat_activity where application_name='savings-concurrency-first' and wait_event='PgSleep')")" == "t" ]]; then
    waiting=true
    break
  fi
  sleep 0.1
done
if [[ "$waiting" != "true" ]]; then
  echo '先行処理のロック保持を確認できませんでした' >&2
  exit 1
fi
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "begin; $operation commit;"
wait "$first_pid"
first_pid=""
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/savings_concurrency_assertions.sql
