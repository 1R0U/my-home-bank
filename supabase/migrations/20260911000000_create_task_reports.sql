-- Issue #156: 子供用タスク画面に、自主的に行った家事を報告できるボタンを追加する -----

create table if not exists task_reports (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references users(id) on delete cascade,
  title text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_by uuid references users(id),
  approved_at timestamptz
);

-- 既存のquests/quest_logs・store_item_requestsと同様、family所属の検証・RLSはPhase 2で検討する
-- （現状はモックログインで実セッションがなく auth.uid() が使えないため）。
