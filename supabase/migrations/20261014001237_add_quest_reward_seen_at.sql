-- Issue #424: タスクが承認されてゴルが入ったことを子供に知らせる -----------------------------
--
-- 【見せ方】
-- 子供が我が家タウンへ戻ったとき、まだ見せていない承認があれば
-- 「〇〇のタスクが みとめられたよ！ +100 gol」とポップアップで1回だけ知らせる。
-- 親の承認は別の端末で起きるので、承認の直後ではなく次に町へ戻ったときに出る
-- （連続記録のお祝い #372 と同じ）。
--
-- 【見せたかどうか（quest_logs.reward_seen_at）】
-- 子供がポップアップを閉じた時刻。null の承認済みの申請が「まだ見せていない」もの。
-- 端末ではなくDBに持つのは、端末を替えたり入れ直したりしても同じ承認を二度出さないため。
-- 書き込みは下の mark_quest_rewards_seen 経由に限る（quest_logs への直接の更新は許していない）。
--
-- 既にある承認済みの申請は、別のマイグレーション（backfill）で「見せた」扱いにする。
-- そうしないと、この仕組みを入れた直後に過去の承認がまとめて出てしまう。

alter table public.quest_logs
  add column if not exists reward_seen_at timestamptz;

-- まだ見せていない承認は、子供が町へ戻るたびに引く。本人の未確認の行だけを引けるようにする。
create index if not exists quest_logs_user_id_unseen_reward_idx
  on public.quest_logs (user_id, approved_at)
  where status = 'approved' and reward_seen_at is null;

-- まだ見せていない承認と、それで入ったゴルを返す ------------------------------------------
--
-- 金額はタスクの今の報酬（quests.reward_amount）ではなく、承認のときに実際に入った額
-- （transactions の quest_reward）を返す。承認の後でタスクの報酬が変わっても、入った額を見せるため。
-- 承認された順（古い順）に返す。
create or replace function public.get_unseen_quest_rewards()
returns table (
  quest_log_id uuid,
  title text,
  amount bigint,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.check_child_session();
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  return query
  select
    ql.id,
    coalesce(q.title, t.description, 'タスク'),
    coalesce(t.amount, 0)::bigint,
    ql.approved_at
  from public.quest_logs ql
  left join public.quests q on q.id = ql.quest_id
  left join public.transactions t on t.quest_log_id = ql.id and t.type = 'quest_reward'
  where ql.user_id = auth.uid()
    and ql.status = 'approved'
    and ql.reward_seen_at is null
  order by ql.approved_at, ql.id;
end;
$$;

revoke all on function public.get_unseen_quest_rewards() from public, anon;
grant execute on function public.get_unseen_quest_rewards() to authenticated;

-- 承認を見せたことを記録する ----------------------------------------------------------------
--
-- 本人の承認済みで、まだ見せていない申請だけを記録する（他人の申請・承認待ち・却下は何もしない）。
-- 時刻はDBが決める。今回あらたに記録した件数を返す。
create or replace function public.mark_quest_rewards_seen(p_quest_log_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_count integer;
begin
  perform public.check_child_session();
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;

  if p_quest_log_ids is null or cardinality(p_quest_log_ids) = 0 then
    return 0;
  end if;

  update public.quest_logs
  set reward_seen_at = now()
  where id = any (p_quest_log_ids)
    and user_id = auth.uid()
    and status = 'approved'
    and reward_seen_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.mark_quest_rewards_seen(uuid[]) from public, anon;
grant execute on function public.mark_quest_rewards_seen(uuid[]) to authenticated;
