-- Issue #208: 家庭共有データへfamily_idを追加する。
-- 既存行の補完とNOT NULL化は、ロックと切り戻し範囲を分けるため後続へ分離する。

alter table public.quests
  add column if not exists family_id uuid references public.families (id) on delete restrict;
alter table public.quest_logs
  add column if not exists family_id uuid references public.families (id) on delete restrict;
alter table public.store_item_requests
  add column if not exists family_id uuid references public.families (id) on delete restrict;
alter table public.task_reports
  add column if not exists family_id uuid references public.families (id) on delete restrict;
alter table public.store_items
  add column if not exists family_id uuid references public.families (id) on delete restrict;

create index if not exists quests_family_id_created_at_idx
  on public.quests (family_id, created_at desc);
create index if not exists quest_logs_family_id_completed_at_idx
  on public.quest_logs (family_id, completed_at desc);
create index if not exists store_item_requests_family_id_created_at_idx
  on public.store_item_requests (family_id, created_at desc);
create index if not exists task_reports_family_id_created_at_idx
  on public.task_reports (family_id, created_at desc);
create index if not exists store_items_family_id_created_at_idx
  on public.store_items (family_id, created_at desc);
