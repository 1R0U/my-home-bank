-- Issue #130: 子供から親へストア商品の追加を申請できる画面を作成する -----------

create table if not exists store_item_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references users(id) on delete cascade,
  title text not null,
  description text not null,
  reason text not null,
  image_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_by uuid references users(id),
  approved_at timestamptz
);

-- 既存のquests/quest_logsと同様、family所属の検証・RLSはPhase 2で検討する
-- （現状はモックログインで実セッションがなく auth.uid() が使えないため）。
