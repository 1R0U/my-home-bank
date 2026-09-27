-- Issue #208: 業務テーブルを認証利用者の家庭・本人へ分離する。
-- クライアントのwhere句は取得量を減らすための補助で、境界の本体はこのRLSとする。

alter table public.quests enable row level security;
alter table public.quest_logs enable row level security;
alter table public.transactions enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.store_item_requests enable row level security;
alter table public.task_reports enable row level security;
alter table public.store_items enable row level security;
alter table public.placed_decorations enable row level security;
alter table public.owned_items enable row level security;
alter table public.equipped_items enable row level security;

create policy quests_select_family on public.quests
for select to authenticated
using (family_id = public.current_user_family_id());

create policy quests_insert_parent on public.quests
for insert to authenticated
with check (
  family_id = public.current_user_family_id()
  and created_by = auth.uid()
  and exists (
    select 1 from public.users
    where id = auth.uid() and role = 'parent'
  )
);

create policy quests_accept_open on public.quests
for update to authenticated
using (
  family_id = public.current_user_family_id()
  and status = 'open'
)
with check (
  family_id = public.current_user_family_id()
  and status = 'accepted'
  and assigned_to = auth.uid()
);

create policy quest_logs_select_family on public.quest_logs
for select to authenticated
using (family_id = public.current_user_family_id());

create policy transactions_select_self on public.transactions
for select to authenticated
using (user_id = auth.uid());

create policy bank_accounts_select_self on public.bank_accounts
for select to authenticated
using (user_id = auth.uid());

create policy store_item_requests_select_family on public.store_item_requests
for select to authenticated
using (family_id = public.current_user_family_id());

create policy store_item_requests_insert_self on public.store_item_requests
for insert to authenticated
with check (
  family_id = public.current_user_family_id()
  and requested_by = auth.uid()
  and status = 'pending'
);

create policy task_reports_select_family on public.task_reports
for select to authenticated
using (family_id = public.current_user_family_id());

create policy task_reports_insert_self on public.task_reports
for insert to authenticated
with check (
  family_id = public.current_user_family_id()
  and reported_by = auth.uid()
  and status = 'pending'
);

create policy store_items_select_family on public.store_items
for select to authenticated
using (family_id = public.current_user_family_id());

create policy store_items_insert_parent on public.store_items
for insert to authenticated
with check (
  family_id = public.current_user_family_id()
  and requested_by = auth.uid()
  and exists (
    select 1 from public.users
    where id = auth.uid() and role = 'parent'
  )
);

create policy placed_decorations_select_self on public.placed_decorations
for select to authenticated using (user_id = auth.uid());
create policy placed_decorations_insert_self on public.placed_decorations
for insert to authenticated with check (user_id = auth.uid());
create policy placed_decorations_update_self on public.placed_decorations
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy placed_decorations_delete_self on public.placed_decorations
for delete to authenticated using (user_id = auth.uid());

create policy owned_items_select_self on public.owned_items
for select to authenticated using (user_id = auth.uid());

create policy equipped_items_select_self on public.equipped_items
for select to authenticated using (user_id = auth.uid());
create policy equipped_items_insert_self on public.equipped_items
for insert to authenticated with check (user_id = auth.uid());
create policy equipped_items_update_self on public.equipped_items
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy equipped_items_delete_self on public.equipped_items
for delete to authenticated using (user_id = auth.uid());

revoke all on table
  public.quests, public.quest_logs, public.transactions, public.bank_accounts,
  public.store_item_requests, public.task_reports, public.store_items,
  public.placed_decorations, public.owned_items, public.equipped_items
from anon, authenticated;

grant select on table public.quests to authenticated;
grant insert (family_id, title, description, reward_amount, status, created_by, category, assigned_to)
  on public.quests to authenticated;
grant update (status, assigned_to) on public.quests to authenticated;

grant select on table public.quest_logs to authenticated;
grant select on table public.transactions to authenticated;
grant select on table public.bank_accounts to authenticated;

grant select on table public.store_item_requests to authenticated;
grant insert (family_id, requested_by, title, description, reason, image_url, status)
  on public.store_item_requests to authenticated;

grant select on table public.task_reports to authenticated;
grant insert (family_id, reported_by, title, description, status)
  on public.task_reports to authenticated;

grant select on table public.store_items to authenticated;
grant insert (family_id, title, description, price, stock, requested_by, image_url)
  on public.store_items to authenticated;

grant select, insert, update, delete on table public.placed_decorations to authenticated;
grant select on table public.owned_items to authenticated;
grant select, insert, update, delete on table public.equipped_items to authenticated;
