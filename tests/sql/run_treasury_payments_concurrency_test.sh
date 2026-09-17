#!/usr/bin/env bash
set -euo pipefail

: "${PGURL:?PGURLを指定してください}"

psql "$PGURL" -v ON_ERROR_STOP=1 -q \
  -f tests/sql/treasury_payments_concurrency_setup.sql

result_dir="$(mktemp -d)"
trap 'rm -rf "$result_dir"' EXIT

purchase_sql="select public.purchase_store_item(
  'c0000000-0000-4000-8000-000000000012',
  'c0000000-0000-4000-8000-000000000031',
  'test-concurrent-store-purchase'
)"
auth_options="-c request.jwt.claim.sub=c0000000-0000-4000-8000-000000000012"

PGOPTIONS="$auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -Atq \
  -c "$purchase_sql" > "$result_dir/first" &
first_pid=$!

# 先行処理が商品行をロックし、遅延トリガーへ到達したことを確認してから後続処理を開始する。
first_waiting=false
for _ in {1..50}; do
  if [[ "$(psql "$PGURL" -Atq -c "
    select exists (
      select 1
      from pg_catalog.pg_stat_activity
      where wait_event = 'PgSleep'
        and query like '%test-concurrent-store-purchase%'
    )
  ")" == "t" ]]; then
    first_waiting=true
    break
  fi
  sleep 0.1
done

if [[ "$first_waiting" != "true" ]]; then
  wait "$first_pid" || true
  echo "先行購入が遅延トリガーへ到達しませんでした" >&2
  exit 1
fi

PGOPTIONS="$auth_options" psql "$PGURL" -v ON_ERROR_STOP=1 -Atq \
  -c "$purchase_sql" > "$result_dir/second" &
second_pid=$!

first_status=0
second_status=0
wait "$first_pid" || first_status=$?
wait "$second_pid" || second_status=$?

if (( first_status != 0 || second_status != 0 )); then
  echo "並行購入RPCの実行に失敗しました" >&2
  exit 1
fi

first_transaction_id="$(tr -d '\r\n' < "$result_dir/first")"
second_transaction_id="$(tr -d '\r\n' < "$result_dir/second")"

if [[ -z "$first_transaction_id" || "$first_transaction_id" != "$second_transaction_id" ]]; then
  echo "並行再送が同じ取引IDを返しませんでした" >&2
  exit 1
fi

psql "$PGURL" -v ON_ERROR_STOP=1 -q \
  -f tests/sql/treasury_payments_concurrency_assertions.sql
