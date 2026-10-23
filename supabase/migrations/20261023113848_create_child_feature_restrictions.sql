-- Issue #348: 親が、子供ごとに機能を使う・使わないを切り替えられるようにする ----------------
--
-- 【何を作るか】
-- - child_feature_restrictions: 子供ごとに「使わない」にした機能（1人1機能1行）
-- - set_child_feature_enabled: 親が、家族の子供の機能を使う・使わないに切り替える
--
-- 【決めたこと（Issue #348 で確認）】
-- - 切り替えるのは親だけ。子供ごとに決める（家族全体の設定ではない）
-- - 今切り替えられるのは銀行（bank）だけ。増やすときは feature の制約に足す
-- - 行が無ければ「使う」。何も設定していない家族・新しく追加した子供は、今までどおり全部使える
-- - 止めるのは銀行の画面への入口だけ（町の建物は残し、入れなくする）。預金・借入などの
--   RPC は止めない。親の経済画面にある自動積立・ローンの管理もそのまま

-- 1. 使わないにした機能 ------------------------------------------------------------------------
create table public.child_feature_restrictions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  feature text not null,
  -- 設定した親。親のアカウントが消えても、設定は残す
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint child_feature_restrictions_feature_check check (feature in ('bank')),
  constraint child_feature_restrictions_user_feature_key unique (user_id, feature)
);

-- 家族の設定をまとめて読む（親の設定画面・RLSの絞り込み）ため
create index child_feature_restrictions_family_id_idx on public.child_feature_restrictions (family_id);

alter table public.child_feature_restrictions enable row level security;

-- 家族のだれでも読める（子供が自分の設定を、親が家族の子供の設定を見る）。
-- 書き込みは set_child_feature_enabled だけ（親であることと、家族の子供であることを確かめるため）
create policy child_feature_restrictions_select_family on public.child_feature_restrictions
for select to authenticated
using (family_id = (select public.current_user_family_id()));

create policy child_feature_restrictions_active_child_session on public.child_feature_restrictions as restrictive
for all to authenticated
using ((select public.current_child_session_is_valid()))
with check ((select public.current_child_session_is_valid()));

revoke all on table public.child_feature_restrictions from anon, authenticated;
grant select on table public.child_feature_restrictions to authenticated;

-- 2. 切り替える --------------------------------------------------------------------------------
--
-- p_user_id の子供の p_feature を、p_enabled が true なら使う（行を消す）、false なら使わない
-- （行を足す）にする。もうそうなっていれば何もしない。
create or replace function public.set_child_feature_enabled(
  p_user_id uuid,
  p_feature text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  select users.family_id into v_family_id
  from public.users
  where users.id = auth.uid() and users.role = 'parent';

  if v_family_id is null then
    raise exception '機能の使う・使わないを決められるのは親だけです';
  end if;

  if p_enabled is null then
    raise exception '使うか使わないかを指定してください';
  end if;

  if p_feature is null or p_feature not in ('bank') then
    raise exception '切り替えられない機能です';
  end if;

  if not exists (
    select 1 from public.users
    where users.id = p_user_id and users.family_id = v_family_id and users.role = 'child'
  ) then
    raise exception '同じ家族の子供だけ選べます';
  end if;

  if p_enabled then
    delete from public.child_feature_restrictions
    where child_feature_restrictions.user_id = p_user_id
      and child_feature_restrictions.feature = p_feature;
  else
    insert into public.child_feature_restrictions (family_id, user_id, feature, created_by)
    values (v_family_id, p_user_id, p_feature, auth.uid())
    on conflict on constraint child_feature_restrictions_user_feature_key do nothing;
  end if;
end;
$$;

revoke all on function public.set_child_feature_enabled(uuid, text, boolean) from public, anon;
grant execute on function public.set_child_feature_enabled(uuid, text, boolean) to authenticated;
