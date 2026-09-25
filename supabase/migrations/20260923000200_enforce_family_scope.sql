-- Issue #208: 補完済みのfamily_idを必須化し、参照先と同じ家庭であることをDBで保証する。

do $$
declare
  v_null_rows bigint;
begin
  select
    (select count(*) from public.quests where family_id is null)
    + (select count(*) from public.quest_logs where family_id is null)
    + (select count(*) from public.store_item_requests where family_id is null)
    + (select count(*) from public.task_reports where family_id is null)
    + (select count(*) from public.store_items where family_id is null)
  into v_null_rows;

  if v_null_rows > 0 then
    raise exception 'family_idを補完できない共有データが%件あります', v_null_rows;
  end if;
end;
$$;

alter table public.quests alter column family_id set not null;
alter table public.quest_logs alter column family_id set not null;
alter table public.store_item_requests alter column family_id set not null;
alter table public.task_reports alter column family_id set not null;
alter table public.store_items alter column family_id set not null;

-- 複合外部キーの参照先。id単体の主キーとは別に、家庭の一致も制約へ含める。
alter table public.users
  add constraint users_id_family_id_unique unique (id, family_id);
alter table public.quests
  add constraint quests_id_family_id_unique unique (id, family_id);

alter table public.quests
  add constraint quests_created_by_family_fkey
    foreign key (created_by, family_id) references public.users (id, family_id) not valid,
  add constraint quests_assigned_to_family_fkey
    foreign key (assigned_to, family_id) references public.users (id, family_id) not valid;
alter table public.quest_logs
  add constraint quest_logs_quest_family_fkey
    foreign key (quest_id, family_id) references public.quests (id, family_id) not valid,
  add constraint quest_logs_user_family_fkey
    foreign key (user_id, family_id) references public.users (id, family_id) not valid,
  add constraint quest_logs_approver_family_fkey
    foreign key (approved_by, family_id) references public.users (id, family_id) not valid;
alter table public.store_item_requests
  add constraint store_item_requests_requester_family_fkey
    foreign key (requested_by, family_id) references public.users (id, family_id) not valid,
  add constraint store_item_requests_approver_family_fkey
    foreign key (approved_by, family_id) references public.users (id, family_id) not valid;
alter table public.task_reports
  add constraint task_reports_reporter_family_fkey
    foreign key (reported_by, family_id) references public.users (id, family_id) not valid,
  add constraint task_reports_approver_family_fkey
    foreign key (approved_by, family_id) references public.users (id, family_id) not valid;
alter table public.store_items
  add constraint store_items_requester_family_fkey
    foreign key (requested_by, family_id) references public.users (id, family_id) not valid;

alter table public.quests validate constraint quests_created_by_family_fkey;
alter table public.quests validate constraint quests_assigned_to_family_fkey;
alter table public.quest_logs validate constraint quest_logs_quest_family_fkey;
alter table public.quest_logs validate constraint quest_logs_user_family_fkey;
alter table public.quest_logs validate constraint quest_logs_approver_family_fkey;
alter table public.store_item_requests validate constraint store_item_requests_requester_family_fkey;
alter table public.store_item_requests validate constraint store_item_requests_approver_family_fkey;
alter table public.task_reports validate constraint task_reports_reporter_family_fkey;
alter table public.task_reports validate constraint task_reports_approver_family_fkey;
alter table public.store_items validate constraint store_items_requester_family_fkey;
