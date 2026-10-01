#!/usr/bin/env bash
set -euo pipefail
: "${PGURL:?PGURLを指定してください}"

# 購入と預入が同じ子のお財布を変更する競合を、既存の購入検証データで再現する。
# 先行預入はusersのロックを保持し、購入が待機してから残高を更新する。
# 購入が先にfamilyをロックしていた旧実装なら、双方が相互待機して失敗する。
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
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f tests/sql/treasury_payments_concurrency_setup.sql
# この競合では、購入台帳作成時の10秒の遅延は不要。
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c 'drop trigger test_delay_concurrent_store_purchase on public.economy_transactions'
psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL'
update public.users set balance = 200 where id = 'c0000000-0000-4000-8000-000000000012';
update public.guild_treasuries set total_supply = 1200 where family_id = 'c0000000-0000-4000-8000-000000000001';
SQL

PGOPTIONS='-c application_name=wallet-circulation-bank -c statement_timeout=15s -c request.jwt.claim.sub=c0000000-0000-4000-8000-000000000012' \
psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select 1 from public.users where id = 'c0000000-0000-4000-8000-000000000012' for update;
select pg_sleep(3);
select public.bank_deposit('c0000000-0000-4000-8000-000000000012', 10);
commit;
SQL
first_pid=$!
first_waiting=false
for _ in {1..50}; do
  if [[ "$(psql "$PGURL" -Atq -c "select exists(select 1 from pg_stat_activity where application_name = 'wallet-circulation-bank' and wait_event = 'PgSleep')")" == "t" ]]; then
    first_waiting=true
    break
  fi
  sleep 0.05
done
[[ "$first_waiting" == "true" ]] || { echo '先行預入のusersロックを確認できませんでした' >&2; exit 1; }

PGOPTIONS='-c application_name=wallet-circulation-purchase -c statement_timeout=15s -c request.jwt.claim.sub=c0000000-0000-4000-8000-000000000012' \
psql "$PGURL" -v ON_ERROR_STOP=1 -q -c "select public.purchase_store_item(
  'c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000031',
    'test-concurrent-store-purchase', 100)" &
second_pid=$!
second_waiting=false
for _ in {1..50}; do
  if [[ "$(psql "$PGURL" -Atq -c "select exists(select 1 from pg_stat_activity where application_name = 'wallet-circulation-purchase' and wait_event_type = 'Lock')")" == "t" ]]; then
    second_waiting=true
    break
  fi
  sleep 0.05
done
[[ "$second_waiting" == "true" ]] || { echo '購入のロック待機を確認できませんでした' >&2; exit 1; }
wait "$first_pid"
wait "$second_pid"

psql "$PGURL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
begin
  if (select balance from public.users where id = 'c0000000-0000-4000-8000-000000000012') <> 90
    or (select deposit_balance from public.bank_accounts where user_id = 'c0000000-0000-4000-8000-000000000012') <> 10
    or (select sum(amount) from public.wallet_circulation_changes where family_id = 'c0000000-0000-4000-8000-000000000001') <> 90 then
    raise exception '預入と購入が正しい額で完了していません';
  end if;
end;
$$;
SQL
