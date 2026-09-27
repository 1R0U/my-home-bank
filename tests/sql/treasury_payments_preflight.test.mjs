// 実際のマイグレーションの事前検査をPostgreSQLで実行する。検証データは全て戻す。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migration = readFileSync(new URL('../../supabase/migrations/20260924000000_connect_treasury_payments.sql', import.meta.url), 'utf8');
const guard = migration.match(/do \$\$[\s\S]*?\$\$;/)?.[0];
assert.ok(guard, 'マイグレーションの事前検査が存在する');
assert.ok(process.env.PGURL, '検証用PGURLが必要');

const result = spawnSync('psql', [process.env.PGURL, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
  encoding: 'utf8',
  input: `
begin;
-- マイグレーション適用前の既存環境を再現する。制約変更は最後にロールバックする。
alter table public.quests drop constraint quests_reward_amount_safe_positive;
alter table public.quests alter column reward_amount drop not null;
insert into public.quests (id, family_id, title, reward_amount, status, category)
values (
  'd0000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000208',
  '報酬額の移行検証', 1, 'open', 'daily'
);
do $test$
declare
  v_amount numeric;
  v_message text;
  v_rejected boolean;
begin
  foreach v_amount in array array[null, 0, -1, 50.5, 9007199254740992, 'NaN'::numeric] loop
    update public.quests set reward_amount = v_amount
    where id = 'd0000000-0000-4000-8000-000000000021';
    v_rejected := false;
    begin
      execute $guard$${guard}$guard$;
    exception when raise_exception then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'quests.reward_amount に1HMC以上の安全な整数でない既存データがあります' then
        raise exception '想定外の事前検査エラー: %', v_message;
      end if;
      v_rejected := true;
    end;
    if not v_rejected then
      raise exception '不正な既存報酬額 % を拒否しませんでした', v_amount;
    end if;
  end loop;
  foreach v_amount in array array[1, 50, 9007199254740991] loop
    update public.quests set reward_amount = v_amount
    where id = 'd0000000-0000-4000-8000-000000000021';
    execute $guard$${guard}$guard$;
  end loop;
end;
$test$;
rollback;
`,
});
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
console.log('既存報酬額の事前検査: 不正値の拒否と安全整数境界の受入に成功');
