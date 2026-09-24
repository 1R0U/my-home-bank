#!/usr/bin/env bash
set -euo pipefail

: "${PGURL:?PGURLを指定してください}"

result_dir="$(mktemp -d)"
first_pid=""
second_pid=""
request_first_pid=""
request_second_pid=""

cleanup() {
  local status=$?
  local cleanup_status=0
  trap - EXIT
  set +e
  for pid in "$first_pid" "$second_pid" "$request_first_pid" "$request_second_pid"; do
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

# 別々の冪等キーによる同時申請を借り手の行ロックで直列化し、
# 後続を一意制約の英語エラーではなく業務エラーで拒否する。
child_auth_options="-c request.jwt.claim.sub=e1000000-0000-4000-8000-000000000012"
first_request_sql="begin;
select public.request_loan(
  'e1000000-0000-4000-8000-000000000012', 50, '並行申請1', 'loan-parallel-first'
);
select pg_sleep(5);
commit;"
second_request_sql="select public.request_loan(
  'e1000000-0000-4000-8000-000000000012', 60, '並行申請2', 'loan-parallel-second'
)"

PGOPTIONS="$child_auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -Atq \
  -c "$first_request_sql" > "$result_dir/request-first" 2> "$result_dir/request-first-error" &
request_first_pid=$!

first_request_waiting=false
for _ in {1..30}; do
  if [[ "$(psql "$PGURL" -Atq -c "
    select exists (
      select 1 from pg_catalog.pg_stat_activity
      where wait_event = 'PgSleep' and query like '%loan-parallel-first%'
    )
  ")" == "t" ]]; then
    first_request_waiting=true
    break
  fi
  sleep 0.2
done
if [[ "$first_request_waiting" != "true" ]]; then
  wait "$request_first_pid" || true
  echo "先行申請がロック保持状態へ到達しませんでした" >&2
  exit 1
fi

PGOPTIONS="$child_auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -Atq \
  -c "$second_request_sql" > "$result_dir/request-second" 2> "$result_dir/request-second-error" &
request_second_pid=$!

request_first_status=0
request_second_status=0
wait "$request_first_pid" || request_first_status=$?
wait "$request_second_pid" || request_second_status=$?
if (( request_first_status != 0 || request_second_status == 0 )); then
  echo "同時申請の直列化結果が想定と異なります" >&2
  exit 1
fi
if ! grep -q "承認待ちのローン申請があります" "$result_dir/request-second-error"; then
  echo "後続の同時申請が業務エラーで拒否されませんでした" >&2
  cat "$result_dir/request-second-error" >&2
  exit 1
fi

psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/loan_concurrency_assertions.sql
