#!/usr/bin/env bash
set -euo pipefail

: "${PGURL:?PGURLを指定してください}"

result_dir="$(mktemp -d)"
first_pid=""
second_pid=""

cleanup() {
  local status=$?
  local cleanup_status=0
  trap - EXIT
  set +e
  for pid in "$first_pid" "$second_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
    fi
  done
  psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/loan_concurrency_cleanup.sql
  cleanup_status=$?
  rm -rf "$result_dir"
  if (( status == 0 && cleanup_status != 0 )); then status=$cleanup_status; fi
  exit "$status"
}
trap cleanup EXIT

psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/loan_concurrency_setup.sql

approve_sql="select public.approve_loan(
  'e1000000-0000-4000-8000-000000000031',
  'e1000000-0000-4000-8000-000000000011'
)"
auth_options="-c request.jwt.claim.sub=e1000000-0000-4000-8000-000000000011"

PGOPTIONS="$auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -Atq \
  -c "$approve_sql" > "$result_dir/first" &
first_pid=$!

first_waiting=false
for _ in {1..30}; do
  if [[ "$(psql "$PGURL" -Atq -c "
    select exists (
      select 1 from pg_catalog.pg_stat_activity
      where wait_event = 'PgSleep' and query like '%approve_loan%'
    )
  ")" == "t" ]]; then
    first_waiting=true
    break
  fi
  sleep 0.1
done
if [[ "$first_waiting" != "true" ]]; then
  wait "$first_pid" || true
  echo "先行承認が遅延トリガーへ到達しませんでした" >&2
  exit 1
fi

PGOPTIONS="$auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -Atq \
  -c "$approve_sql" > "$result_dir/second" &
second_pid=$!

first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?
if (( first_status != 0 || second_status != 0 )); then
  echo "並行承認RPCの実行に失敗しました" >&2
  exit 1
fi

first_loan_id="$(tr -d '\r\n' < "$result_dir/first")"
second_loan_id="$(tr -d '\r\n' < "$result_dir/second")"
if [[ -z "$first_loan_id" || "$first_loan_id" != "$second_loan_id" ]]; then
  echo "並行承認が同じローンIDを返しませんでした" >&2
  exit 1
fi

psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/loan_concurrency_assertions.sql
