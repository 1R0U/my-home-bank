-- Issue #354: 掲示板で見るお知らせ（通知）を保存する -----------------------------------
--
-- 【何を保存するか】
-- 1人あての「お知らせ」1件を1行で持つ。だれあてか（user_id）、見出し（title）、
-- 本文（body）、押したときに開く画面の種類（route）、届いた時刻（created_at）、
-- 読んだ時刻（read_at）。read_at が NULL のものが「未読」。
--
-- 【だれが行を作るか】
-- このマイグレーションでは入れ物だけを作り、行を作る処理は持たない。
-- お知らせを作るのは、アプリ通知の各Issue（大人 #357〜#361、子供 #362〜#368）で足す
-- DB側の関数・トリガー（security definer）にする想定のため、アプリ（authenticated）には
-- insert を許可しない。アプリから自由に作れると、別の人あての通知を偽装できてしまう。
--
-- 【route を CHECK 制約で縛る理由】
-- 画面のパスではなく「何の建物か」（lib/rpg-hub/routes.ts の MapRouteId）を入れ、
-- 実際の遷移先は開く人のロールからアプリ側が決める（大人と子供でタスク・ストアの画面が違う）。
-- 未知の値が入るとアプリが遷移先を決められないので、使える値を縛る。
-- 増やすときは新しいマイグレーションで制約を張り替える。
--
-- 【家庭ごとの分離について】
-- お知らせは本人だけが見るもので、家庭で共有しない。character_appearances と同じく
-- family_id は持たせず、本人（users.id）にだけ紐づけてRLSで分ける。

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  route text,
  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint notifications_title_not_blank
    check (length(btrim(title)) > 0),
  constraint notifications_route_allowed
    check (route is null or route in ('bank', 'history', 'store', 'tasks'))
);

-- 掲示板は「自分あてを新しい順に」並べるので、その順に引けるようにしておく
create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_self on public.notifications
for select to authenticated using (user_id = auth.uid());

revoke all on table public.notifications from anon, authenticated;
-- 読むだけを許可する。既読にするのは下の mark_notifications_read 経由に限る
-- （read_at を任意の時刻へ書き換えたり、未読へ戻したりできないようにするため）。
grant select on table public.notifications to authenticated;

-- 自分あてのお知らせを既読にする ---------------------------------------------------------
--
-- p_notification_ids に既読にするお知らせのidを渡す。NULL を渡すと自分あての未読を
-- すべて既読にする（掲示板の「すべて既読にする」）。
-- 別の人あてのidや、すでに既読のものは黙って無視する（既読の時刻は最初に読んだときのまま）。
-- 戻り値は、今回あらたに既読にした件数。
create or replace function public.mark_notifications_read(
  p_notification_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_notification_ids is null or id = any (p_notification_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
